import cv2
import torch
import numpy as np
from ultralytics import YOLO
from scipy.spatial import distance

# Load the YOLO model
model_path = "models/vehicle.pt"
model = YOLO(model_path)

# Check if CUDA is available
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model.to(device)

# Open video file
# VIDEO_SOURCE = "videos/stock-footage.mp4" 
# VIDEO_SOURCE = "videos/india.mp4"
# VIDEO_SOURCE = "videos/night.mp4"
VIDEO_SOURCE = "videos/crash.mp4"

cap = cv2.VideoCapture(VIDEO_SOURCE)

# Get video FPS (frames per second)
fps = cap.get(cv2.CAP_PROP_FPS)

# Define scale factor (pixels to meters) - adjust based on real-world calibration
scale_factor = 0.05  # 1 pixel = 0.05 meters

# Smoothing factor for exponential moving average
alpha = 0.4  

# Dictionaries to store smoothed speeds, object IDs, and previous bounding box centers
smoothed_speeds = {}
prev_centers = {}
object_ids = {}
next_object_id = 1  # Counter for assigning new IDs

# Read the first frame and convert it to grayscale
ret, prev_frame = cap.read()
if not ret:
    print("Error: Couldn't read video file.")
    cap.release()
    exit()

prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Convert to grayscale for optical flow calculation
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Run YOLO inference
    results = model(frame, verbose=False)

    # Copy frame to overlay results
    output_frame = frame.copy()

    frame_height = frame.shape[0]  # Get bottom of frame

    detected_objects = []  # Store detected object centers for matching

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box coordinates

            # Calculate bottom center of bounding box
            center_x = (x1 + x2) // 2
            center_y = y2  # Bottom center Y
            detected_objects.append((center_x, center_y))  # Store for ID assignment

    # Match detected objects to existing IDs using Euclidean distance
    new_object_ids = {}
    for center_x, center_y in detected_objects:
        min_distance = float('inf')
        assigned_id = None

        # Find the closest previous object
        for obj_id, (prev_x, prev_y) in object_ids.items():
            dist = distance.euclidean((center_x, center_y), (prev_x, prev_y))
            if dist < min_distance and dist < 50:  # Threshold for matching
                min_distance = dist
                assigned_id = obj_id

        # Assign new ID if no match is found
        if assigned_id is None:
            assigned_id = next_object_id
            next_object_id += 1

        new_object_ids[assigned_id] = (center_x, center_y)

    # Update the object IDs with the new frame's detections
    object_ids = new_object_ids

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box coordinates

            # Calculate bottom center of bounding box
            center_x = (x1 + x2) // 2
            center_y = y2
            distance_from_bottom = frame_height - center_y

            # Find the corresponding object ID
            obj_id = None
            for id_key, (cx, cy) in object_ids.items():
                if cx == center_x and cy == center_y:
                    obj_id = id_key
                    break

            if obj_id is None:
                continue  # Skip if no ID was found (shouldn't happen)

            # Crop bounding box area from grayscale frames
            prev_gray_crop = prev_gray[y1:y2, x1:x2]
            gray_crop = gray[y1:y2, x1:x2]

            if prev_gray_crop.shape[0] > 1 and prev_gray_crop.shape[1] > 1:
                # Compute dense optical flow inside bounding box
                flow = cv2.calcOpticalFlowFarneback(prev_gray_crop, gray_crop, None, 
                                                    0.5, 3, 15, 3, 5, 1.2, 0)

                # Compute magnitude and direction of flow
                mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])

                # Compute average motion magnitude
                avg_motion = np.mean(mag)

                # Convert to real-world speed using Optical Flow
                dt = 1 / fps  # Time interval between frames
                speed_mps = (avg_motion * scale_factor) / dt  # Speed in meters per second
                speed_kmph = speed_mps * 3.6  # Convert to km/h

                # Apply exponential smoothing
                if obj_id not in smoothed_speeds:
                    smoothed_speeds[obj_id] = speed_kmph  # Initialize

                smoothed_speeds[obj_id] = alpha * speed_kmph + (1 - alpha) * smoothed_speeds[obj_id]

                # Compute speed using bounding box displacement method
                if obj_id in prev_centers:
                    prev_distance = prev_centers[obj_id]
                    pixel_displacement = abs(distance_from_bottom - prev_distance)
                    speed_bb_mps = (pixel_displacement * scale_factor) / dt  # Speed in m/s
                    speed_bb_kmph = speed_bb_mps * 3.6  # Convert to km/h
                else:
                    speed_bb_kmph = 0  # No previous data

                # Store current center for next frame
                prev_centers[obj_id] = distance_from_bottom

                # Convert flow visualization to HSV format
                hsv = np.zeros_like(frame[y1:y2, x1:x2])
                hsv[..., 1] = 255  # Full saturation
                hsv[..., 0] = ang * 180 / np.pi / 2  # Hue represents direction
                hsv[..., 2] = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX)  # Value represents speed

                # Convert HSV to BGR and overlay on frame
                flow_rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
                output_frame[y1:y2, x1:x2] = flow_rgb

                # Display unique object ID and both speeds
                cv2.putText(output_frame, f"ID: {obj_id}", (x1, y1 - 40), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 255, 0), 1)
                cv2.putText(output_frame, f"Optical: {smoothed_speeds[obj_id]:.2f} km/h", 
                            (x1, y1 - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 255, 255), 1)
                cv2.putText(output_frame, f"BB Dist: {speed_bb_kmph:.2f} km/h", 
                            (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 255, 0), 1)


    # Display the output
    cv2.imshow("Optical Flow - Smoothed Speed Estimation", output_frame)

    # Update previous frame
    prev_gray = gray.copy()

    # Exit on pressing 'q'
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
