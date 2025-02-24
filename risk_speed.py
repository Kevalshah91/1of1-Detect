import cv2
import numpy as np
import torch
from ultralytics import YOLO
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import time

class accDetector:
    def __init__(self, fps=30, scale_factor=0.05, smoothing_factor=0.4):
        self.fps = fps
        self.scale_factor = scale_factor
        self.alpha = smoothing_factor
        self.prev_gray = None
        self.smoothed_accs = {}
        self.prev_centers = {}
        
    def calculate_acc(self, frame, detection_data):
        if self.prev_gray is None:
            self.prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            return 0
            
        current_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        x1, y1, x2, y2 = detection_data['bbox']
        obj_id = detection_data['id']
        
        # Crop regions for optical flow
        prev_gray_crop = self.prev_gray[y1:y2, x1:x2]
        current_gray_crop = current_gray[y1:y2, x1:x2]
        
        if prev_gray_crop.shape[0] > 1 and prev_gray_crop.shape[1] > 1:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray_crop, 
                current_gray_crop, 
                None, 
                0.5, 3, 15, 3, 5, 1.2, 0
            )
            
            mag = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
            avg_motion = np.mean(mag)
            
            dt = 1 / self.fps
            acc_mps = (avg_motion * self.scale_factor) / dt
            acc_kmph = acc_mps * 3.6
            
            if obj_id not in self.smoothed_accs:
                self.smoothed_accs[obj_id] = acc_kmph
            else:
                self.smoothed_accs[obj_id] = (
                    self.alpha * acc_kmph + 
                    (1 - self.alpha) * self.smoothed_accs[obj_id]
                )
            
        self.prev_gray = current_gray
        return self.smoothed_accs.get(obj_id, 0)

class LaneDetector:
    def __init__(self):
        self.prev_left_line = None
        self.prev_right_line = None
        self.left_lines_history = deque(maxlen=3)  # Reduced history for lower latency
        self.right_lines_history = deque(maxlen=3)
        
    def detect_lane(self, image):
        height, width = image.shape[:2]
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        white_mask = cv2.inRange(
            hsv,
            np.array([0, 0, 200]),
            np.array([180, 30, 255])
        )
        yellow_mask = cv2.inRange(
            hsv,
            np.array([20, 100, 100]),
            np.array([30, 255, 255])
        )
        
        mask = cv2.bitwise_or(white_mask, yellow_mask)
        edges = cv2.Canny(mask, 50, 150)
        
        roi_vertices = np.array([
            [(0, height),
             (width * 0.35, height * 0.5),
             (width * 0.65, height * 0.5),
             (width, height)]
        ], dtype=np.int32)
        
        roi_mask = np.zeros_like(edges)
        cv2.fillPoly(roi_mask, roi_vertices, 255)
        masked_edges = cv2.bitwise_and(edges, roi_mask)
        
        lines = cv2.HoughLinesP(
            masked_edges,
            rho=1,
            theta=np.pi/180,
            threshold=20,
            minLineLength=30,
            maxLineGap=50
        )
        
        left_lines, right_lines = [], []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                if x2 - x1 == 0:
                    continue
                    
                slope = (y2 - y1) / (x2 - x1)
                if abs(slope) < 0.3 or abs(slope) > 2.0:
                    continue
                    
                if slope < 0:
                    left_lines.append(line[0])
                else:
                    right_lines.append(line[0])
        
        left_line = self._process_lane_lines(left_lines, height, True)
        right_line = self._process_lane_lines(right_lines, height, False)
        
        if left_line is not None:
            self.left_lines_history.append(left_line)
        if right_line is not None:
            self.right_lines_history.append(right_line)
        
        left_line = self._get_smoothed_line(self.left_lines_history)
        right_line = self._get_smoothed_line(self.right_lines_history)
        
        lane_center = width // 2
        lane_width = width // 2
        
        if left_line is not None and right_line is not None:
            lane_center = (left_line[0] + right_line[0]) // 2
            lane_width = right_line[0] - left_line[0]
        
        return lane_center, lane_width, left_line, right_line

    def _process_lane_lines(self, lines, height, is_left):
        if not lines:
            return self.prev_left_line if is_left else self.prev_right_line
            
        points = np.array([(x1, y1) for x1, y1, x2, y2 in lines] + 
                         [(x2, y2) for x1, y1, x2, y2 in lines])
        
        coeffs = np.polyfit(points[:, 1], points[:, 0], deg=1)
        
        y_bottom = height
        y_top = int(height * 0.5)
        x_bottom = int(coeffs[0] * y_bottom + coeffs[1])
        x_top = int(coeffs[0] * y_top + coeffs[1])
        
        line = [x_bottom, y_bottom, x_top, y_top]
        
        if is_left:
            self.prev_left_line = line
        else:
            self.prev_right_line = line
            
        return line

    def _get_smoothed_line(self, line_history):
        if not line_history:
            return None
        return np.mean(list(line_history), axis=0, dtype=np.int32)

class RiskAssessor:
    def __init__(self):
        self.vehicle_history = {}
        self.risk_threshold_close = 50
        self.risk_threshold_acc = 15
        
    def calculate_risk(self, vehicle_data, lane_center, lane_width, frame_time):
        vehicle_id = vehicle_data['id']
        vehicle_x = vehicle_data['center_x']
        vehicle_y = vehicle_data['center_y']
        vehicle_acc = vehicle_data.get('acc', 0)
        
        if vehicle_id in self.vehicle_history:
            prev_data = self.vehicle_history[vehicle_id]
            
            acc_factor = min(1.0, vehicle_acc / 50.0)
            proximity_factor = min(1.0, (lane_width - abs(vehicle_x - lane_center)) / self.risk_threshold_close)
            lane_invasion = abs(vehicle_x - lane_center) < (lane_width * 0.4)
            
            risk_score = (
                acc_factor * 0.5 +
                proximity_factor * 0.4 +
                float(lane_invasion) * 0.1
            )
            
            risk_level = "SAFE"
            if risk_score > 0.7:
                risk_level = "DANGER"
            elif risk_score > 0.4:
                risk_level = "WARNING"
                
        else:
            risk_level = "SAFE"
            risk_score = 0
            
        self.vehicle_history[vehicle_id] = {
            'x': vehicle_x,
            'y': vehicle_y,
            'time': frame_time,
            'acc': vehicle_acc
        }
        
        return risk_level, risk_score

def process_frame(frame, model, lane_detector, acc_detector, risk_assessor, frame_time):
    # Resize frame for faster processing
    frame = cv2.resize(frame, (640, 480))
    
    with ThreadPoolExecutor(max_workers=2) as executor:
        lane_future = executor.submit(lane_detector.detect_lane, frame)
        yolo_future = executor.submit(model, frame, verbose=False)
        
        lane_center, lane_width, left_line, right_line = lane_future.result()
        results = yolo_future.result()
    
    if left_line is not None and right_line is not None:
        overlay = frame.copy()
        cv2.fillPoly(overlay, [np.array([
            [left_line[0], left_line[1]],
            [left_line[2], left_line[3]],
            [right_line[2], right_line[3]],
            [right_line[0], right_line[1]]
        ])], (0, 255, 0, 128))
        cv2.addWeighted(overlay, 0.35, frame, 0.65, 0, frame)
    
    for result in results:
        for box in result.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            
            if conf >= 0.5:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                detection_data = {
                    'id': f"{cls}_{x1}_{y1}",
                    'bbox': (x1, y1, x2, y2),
                    'center_x': (x1 + x2) // 2,
                    'center_y': (y1 + y2) // 2
                }
                
                acc = acc_detector.calculate_acc(frame, detection_data)
                detection_data['acc'] = acc
                
                risk_level, risk_score = risk_assessor.calculate_risk(
                    detection_data, lane_center, lane_width, frame_time
                )
                
                color = {
                    "SAFE": (0, 255, 0),
                    "WARNING": (0, 255, 255),
                    "DANGER": (0, 0, 255)
                }[risk_level]
                
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                
                info_text = [
                    f"ID: {detection_data['id']}",
                    f"acc: {acc:.1f} km/h",
                    f"Risk: {risk_level}",
                    f"Score: {risk_score:.2f}"
                ]
                
                for i, text in enumerate(info_text):
                    y_offset = y1 - 10 - (i * 15)
                    cv2.putText(frame, text, (x1, y_offset),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
    
    return frame

def main():
    # You can change this to 0 for webcam or provide a video path
    VIDEO_SOURCE = "test_videos\lane.mp4"  # Replace with your video path
    
    # Initialize YOLO model
    model = YOLO('yolov8n.pt')
    if torch.cuda.is_available():
        model.to('cuda')
        print("Using CUDA")
    else:
        print("Using CPU")
    
    # Initialize video capture
    try:
        # First try to convert VIDEO_SOURCE to integer for webcam
        cap = cv2.VideoCapture(int(VIDEO_SOURCE))
    except ValueError:
        # If not an integer, treat as file path
        cap = cv2.VideoCapture(VIDEO_SOURCE)
        
    if not cap.isOpened():
        print(f"Error: Could not open video source {VIDEO_SOURCE}")
        return
    
    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Get video FPS for acc calculation
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    if fps == 0:  # If FPS is 0 (common with webcams), set to 30
        fps = 30
    
    # Initialize components
    lane_detector = LaneDetector()
    acc_detector = accDetector(fps=fps)  # Pass the correct FPS
    risk_assessor = RiskAssessor()
    
    frame_count = 0
    start_time = time.time()
    fps_display = 0
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("End of video file or error reading frame")
                break
                
            frame_count += 1
            current_time = time.time()
            
            # Process frame
            processed_frame = process_frame(
                frame,
                model,
                lane_detector,
                acc_detector,
                risk_assessor,
                current_time
            )
            
            # Calculate and display FPS
            if frame_count % 30 == 0:
                fps_display = 30.0 / (current_time - start_time)
                start_time = current_time
                
            cv2.putText(processed_frame, f"FPS: {fps_display:.1f}",
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                       1, (0, 255, 0), 2)
            
            # Display the frame
            cv2.imshow('Vehicle Detection', processed_frame)
            
            # Break loop on 'q' press
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
    finally:
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()