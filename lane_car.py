import cv2
import numpy as np
import math
import time
from ultralytics import YOLO  # YOLOv8 module

# Function to mask out the region of interest
def region_of_interest(img, vertices):
    mask = np.zeros_like(img)
    match_mask_color = 255
    cv2.fillPoly(mask, vertices, match_mask_color)
    masked_image = cv2.bitwise_and(img, mask)
    return masked_image

# Function to draw the filled polygon between the lane lines
def draw_lane_lines(img, left_line, right_line, color=[0, 255, 0], thickness=10):
    line_img = np.zeros_like(img)
    poly_pts = np.array([[
        (left_line[0], left_line[1]),
        (left_line[2], left_line[3]),
        (right_line[2], right_line[3]),
        (right_line[0], right_line[1])
    ]], dtype=np.int32)
    
    cv2.fillPoly(line_img, poly_pts, color)
    img = cv2.addWeighted(img, 0.8, line_img, 0.5, 0.0)
    return img

# The lane detection pipeline
def pipeline(image):
    height, width = image.shape[:2]
    region_of_interest_vertices = [
        (0, height),
        (width / 2, height / 2),
        (width, height),
    ]
    gray_image = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    cannyed_image = cv2.Canny(gray_image, 100, 200)
    cropped_image = region_of_interest(
        cannyed_image,
        np.array([region_of_interest_vertices], np.int32)
    )
    
    lines = cv2.HoughLinesP(
        cropped_image,
        rho=6,
        theta=np.pi / 60,
        threshold=160,
        lines=np.array([]),
        minLineLength=40,
        maxLineGap=25
    )
    
    left_line_x, left_line_y, right_line_x, right_line_y = [], [], [], []
    
    if lines is None:
        return image

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
    
    left_x_start, left_x_end, right_x_start, right_x_end = 0, 0, 0, 0
    if left_line_x and left_line_y:
        poly_left = np.poly1d(np.polyfit(left_line_y, left_line_x, deg=1))
        left_x_start, left_x_end = int(poly_left(max_y)), int(poly_left(min_y))
    if right_line_x and right_line_y:
        poly_right = np.poly1d(np.polyfit(right_line_y, right_line_x, deg=1))
        right_x_start, right_x_end = int(poly_right(max_y)), int(poly_right(min_y))
    
    return draw_lane_lines(
        image,
        [left_x_start, max_y, left_x_end, min_y],
        [right_x_start, max_y, right_x_end, min_y]
    )

# Function to estimate distance
def estimate_distance(bbox_width, bbox_height):
    focal_length = 1000
    known_width = 2.0
    return (known_width * focal_length) / bbox_width

# Function to calculate speed and acceleration
def calculate_motion(prev_position, current_position, prev_time, current_time):
    distance = math.sqrt((current_position[0] - prev_position[0])**2 + (current_position[1] - prev_position[1])**2)
    time_elapsed = current_time - prev_time
    speed = distance / time_elapsed if time_elapsed > 0 else 0
    acceleration = speed / time_elapsed if time_elapsed > 0 else 0
    return speed, acceleration

# Process webcam feed
def process_webcam():
    model = YOLO('weights/yolov8n.pt')
    cap = cv2.VideoCapture(1)
    
    if not cap.isOpened():
        print("Error: Unable to access webcam.")
        return
    
    prev_positions = {}
    prev_time = time.time()
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        resized_frame = cv2.resize(frame, (1280, 720))
        lane_frame = pipeline(resized_frame)
        results = model(resized_frame)
        current_time = time.time()
        
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf, cls = box.conf[0], int(box.cls[0])
                
                vehicle_types = ['car', 'truck', 'bus', 'motorbike', 'bicycle']
                if model.names[cls] in vehicle_types and conf >= 0.5:
                    label = f'{model.names[cls]} {conf:.2f}'
                    cv2.rectangle(lane_frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                    cv2.putText(lane_frame, label, (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
                    distance_label = f'Distance: {estimate_distance(x2 - x1, y2 - y1):.2f}m'
                    cv2.putText(lane_frame, distance_label, (x1, y2 + 20),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
                    
                    speed, acceleration = calculate_motion(prev_positions.get(cls, (x1, y1)), (x1, y1), prev_time, current_time)
                    motion_label = f'Speed: {speed:.2f} m/s, Accel: {acceleration:.2f} m/s^2'
                    cv2.putText(lane_frame, motion_label, (x1, y2 + 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    prev_positions[cls] = (x1, y1)
        
        cv2.imshow('Lane and Vehicle Detection', lane_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()

process_webcam()
