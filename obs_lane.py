'''
Blue Boxes (255, 0, 0): These show all objects detected by the world model (the YOLOv8s-world model). These are being drawn primarily for debugging purposes so you can see what the world model is detecting.
Red Boxes (0, 0, 255): These indicate objects that meet TWO conditions:

The object is detected within the lane boundaries (using the is_in_lane() function)
The object overlaps with a detection from the world model
This essentially shows potentially hazardous objects that are both in your lane and detected as obstacles.


Green Boxes (0, 255, 0): These show all other detections from the lane model (YOLOv8n) that either:

Are not in the lane, OR
Don't overlap with world model detections
'''

import cv2
import numpy as np
import math
import time
import torch
from ultralytics import YOLO

def region_of_interest(img, vertices):
    mask = np.zeros_like(img)
    cv2.fillPoly(mask, np.array([vertices], np.int32), 255)
    return cv2.bitwise_and(img, mask)

def draw_lane_lines(img, left_line, right_line, color=[0, 255, 0], thickness=10):
    line_img = np.zeros_like(img)
    poly_pts = np.array([[
        (left_line[0], left_line[1]),
        (left_line[2], left_line[3]),
        (right_line[2], right_line[3]),
        (right_line[0], right_line[1])
    ]], dtype=np.int32)
    
    cv2.fillPoly(line_img, poly_pts, color)
    return cv2.addWeighted(img, 0.8, line_img, 0.5, 0.0)

def pipeline(image):
    height, width = image.shape[:2]
    roi_vertices = [
        (0, height),
        (width / 2, height / 2),
        (width, height),
    ]
    
    gray_image = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    cannyed_image = cv2.Canny(gray_image, 100, 200)
    cropped_image = region_of_interest(cannyed_image, roi_vertices)
    
    lines = cv2.HoughLinesP(
        cropped_image,
        rho=6,
        theta=np.pi / 60,
        threshold=160,
        lines=np.array([]),
        minLineLength=40,
        maxLineGap=25
    )
    
    left_line_x, left_line_y = [], []
    right_line_x, right_line_y = [], []
    
    if lines is None:
        return image, roi_vertices

    for line in lines:
        for x1, y1, x2, y2 in line:
            slope = (y2 - y1) / (x2 - x1) if (x2 - x1) != 0 else 0
            if abs(slope) < 0.5:
                continue
            if slope <= 0:
                left_line_x.extend([x1, x2])
                left_line_y.extend([y1, y2])
            else:
                right_line_x.extend([x1, x2])
                right_line_y.extend([y1, y2])
    
    min_y, max_y = int(height * (3 / 5)), height
    
    left_x_start = left_x_end = right_x_start = right_x_end = 0
    if left_line_x and left_line_y:
        poly_left = np.poly1d(np.polyfit(left_line_y, left_line_x, deg=1))
        left_x_start, left_x_end = int(poly_left(max_y)), int(poly_left(min_y))
    if right_line_x and right_line_y:
        poly_right = np.poly1d(np.polyfit(right_line_y, right_line_x, deg=1))
        right_x_start, right_x_end = int(poly_right(max_y)), int(poly_right(min_y))
    
    lane_frame = draw_lane_lines(
        image,
        [left_x_start, max_y, left_x_end, min_y],
        [right_x_start, max_y, right_x_end, min_y]
    )
    
    return lane_frame, roi_vertices

def is_in_lane(box_coords, roi_vertices):
    x1, y1, x2, y2 = box_coords
    box_bottom_center = ((x1 + x2) // 2, y2)
    
    roi_vertices = np.array(roi_vertices, np.int32)
    point = np.array(box_bottom_center)
    
    return cv2.pointPolygonTest(roi_vertices, (float(point[0]), float(point[1])), False) >= 0

def process_webcam():
    # Load both models
    lane_model = YOLO('yolov8n.pt')  # Changed path to default
    world_model = YOLO('/models/yolov8s-world.pt')  # Make sure this path is correct
    
    # Check CUDA availability
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    world_model.to(device)
    lane_model.to(device)
    
    cap = cv2.VideoCapture(1)  # Try 0 first, if not working try 1
    if not cap.isOpened():
        print("Error: Unable to access webcam.")
        return
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Resize frame
        resized_frame = cv2.resize(frame, (1280, 720))
        
        # Get lane detection
        lane_frame, roi_vertices = pipeline(resized_frame.copy())
        
        # Run world model detection first
        world_boxes = []
        world_results = world_model(resized_frame, verbose=False)
        
        # Store world model detections
        for result in world_results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                world_boxes.append((x1, y1, x2, y2))
                # Draw world model detections in blue for debugging
                cv2.rectangle(lane_frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
        
        # Run lane model detection
        lane_results = lane_model(resized_frame, verbose=False)
        
        # Process lane model detections
        for result in lane_results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                
                if conf < 0.5:  # Skip low confidence detections
                    continue
                
                # Check if object is in lane
                in_lane = is_in_lane((x1, y1, x2, y2), roi_vertices)
                
                # Check overlap with world detections
                is_overlapping = any(
                    x1 < wb[2] and x2 > wb[0] and y1 < wb[3] and y2 > wb[1]
                    for wb in world_boxes
                )
                
                # Determine color based on conditions
                if in_lane and is_overlapping:
                    color = (0, 0, 255)  # Red for overlap in lane
                else:
                    color = (0, 255, 0)  # Green for other detections
                
                # Draw bounding box and label
                cv2.rectangle(lane_frame, (x1, y1), (x2, y2), color, 2)
                label = f'{lane_model.names[cls]} {conf:.2f}'
                cv2.putText(lane_frame, label, (x1, y1 - 10),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Show the frame
        cv2.imshow('Combined Detection System', lane_frame)
        
        # Break the loop if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    process_webcam()