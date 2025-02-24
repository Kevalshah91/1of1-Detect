from flask import Flask, jsonify
import cv2
import threading
import time
import os
from collections import deque
import numpy as np
from datetime import datetime
import copy

app = Flask(__name__)

# Global variables
frame_buffer = deque(maxlen=900)  # 30 seconds at 30 fps = 900 frames
buffer_lock = threading.Lock()  # Add lock for thread safety
recording_flag = False
accident_flag = False
camera = None
recording_thread = None

def initialize_camera():
    global camera
    camera = cv2.VideoCapture(0)  # Use 0 for default webcam
    if not camera.isOpened():
        raise Exception("Could not open camera")
    camera.set(cv2.CAP_PROP_FPS, 30)

def cleanup_camera():
    global camera
    if camera:
        camera.release()

def frame_capture():
    global frame_buffer, camera, recording_flag
    while recording_flag:
        if camera and camera.isOpened():
            ret, frame = camera.read()
            if ret:
                with buffer_lock:
                    frame_buffer.append(frame)
            time.sleep(1/30)  # Approximate 30 FPS

def save_accident_video():
    global frame_buffer, accident_flag
    
    if not os.path.exists('recordings'):
        os.makedirs('recordings')
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = f'recordings/accident_{timestamp}.mp4'
    
    # Create a copy of the buffer with the lock
    with buffer_lock:
        frames_to_save = list(frame_buffer)
    
    if frames_to_save:
        # Get video properties from the first frame
        height, width = frames_to_save[0].shape[:2]
        
        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, 30.0, (width, height))
        
        # Write frames to video
        for frame in frames_to_save:
            out.write(frame)
        
        out.release()
        print(f"Accident video saved to {output_path}")
    
    accident_flag = False

@app.route('/start', methods=['POST'])
def start_recording():
    global recording_thread, recording_flag
    
    try:
        if not recording_flag:  # Prevent multiple recording threads
            initialize_camera()
            recording_flag = True
            recording_thread = threading.Thread(target=frame_capture)
            recording_thread.daemon = True
            recording_thread.start()
            return jsonify({"message": "Recording started successfully"}), 200
        return jsonify({"message": "Recording is already running"}), 400
    except Exception as e:
        recording_flag = False  # Reset flag if initialization fails
        return jsonify({"error": str(e)}), 500

@app.route('/stop', methods=['POST'])
def stop_recording():
    global recording_flag, camera, recording_thread
    
    recording_flag = False
    if recording_thread:
        recording_thread.join(timeout=1.0)  # Wait for thread to finish
    cleanup_camera()
    return jsonify({"message": "Recording stopped successfully"}), 200

@app.route('/accident', methods=['POST'])
def report_accident():
    global accident_flag
    
    if not recording_flag:
        return jsonify({"error": "Recording is not active"}), 400
    
    accident_flag = True
    try:
        save_accident_video()
        return jsonify({"message": "Accident video saved successfully"}), 200
    except Exception as e:
        accident_flag = False
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    with buffer_lock:
        buffer_size = len(frame_buffer)
    return jsonify({
        "recording": recording_flag,
        "buffer_size": buffer_size,
        "accident_mode": accident_flag
    }), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)