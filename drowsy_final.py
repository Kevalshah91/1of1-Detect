import cv2
import dlib
import numpy as np
from scipy.spatial import distance
import pygame

# Initialize pygame mixer for playing sound
pygame.mixer.init()
alarm_sound = "Gong.mp3"  # Replace with your alert sound file

# Load dlib’s face detector and landmark predictor
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# Define eye aspect ratio function
def eye_aspect_ratio(eye):
    A = distance.euclidean(eye[1], eye[5])
    B = distance.euclidean(eye[2], eye[4])
    C = distance.euclidean(eye[0], eye[3])
    return (A + B) / (2.0 * C)

# Define mouth aspect ratio function
def mouth_aspect_ratio(mouth):
    A = distance.euclidean(mouth[2], mouth[10])  # Top lip to bottom lip
    B = distance.euclidean(mouth[4], mouth[8])   # More lip distance
    C = distance.euclidean(mouth[0], mouth[6])   # Horizontal width
    return (A + B) / (2.0 * C)

# Threshold values for drowsiness detection
EYE_AR_THRESH = 0.25
MOUTH_AR_THRESH = 1.0
DROWSY_THRESHOLD = 30  # Number of frames before drowsy alert
ALARM_PLAYING = False  # To track if alarm is playing

# Start video capture (0 for webcam)
video_cap = cv2.VideoCapture(0)

drowsy_score = 0

while True:
    ret, frame = video_cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (800, 500))
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Detect faces
    faces = detector(gray)

    for face in faces:
        landmarks = predictor(gray, face)

        # Extract eye and mouth points
        left_eye = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(36, 42)])
        right_eye = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(42, 48)])
        mouth = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(48, 68)])

        # Calculate aspect ratios
        ear_left = eye_aspect_ratio(left_eye)
        ear_right = eye_aspect_ratio(right_eye)
        ear_avg = (ear_left + ear_right) / 2.0
        mar = mouth_aspect_ratio(mouth)

        # Draw facial landmarks
        for (x, y) in np.vstack([left_eye, right_eye, mouth]):
            cv2.circle(frame, (x, y), 2, (0, 255, 0), -1)

        # Check drowsiness conditions
        eye_closed = ear_avg < EYE_AR_THRESH
        yawning = mar > MOUTH_AR_THRESH

        if eye_closed or yawning:
            drowsy_score += 1
        else:
            drowsy_score = max(drowsy_score - 1, 0)

        # Display alerts based on drowsy_score
        if drowsy_score >= DROWSY_THRESHOLD:
            cv2.putText(frame, "DROWSY ALERT!", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)

            # Play alarm if not already playing
            if not pygame.mixer.music.get_busy():
                pygame.mixer.music.load(alarm_sound)
                pygame.mixer.music.play(-1)  # Play in loop
                ALARM_PLAYING = True

        else:
            # Stop alarm if drowsiness is resolved
            if ALARM_PLAYING:
                pygame.mixer.music.stop()
                ALARM_PLAYING = False

        # Display score
        cv2.putText(frame, f"Score: {drowsy_score}", (20, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    # Show the frame
    cv2.imshow('Drowsiness Detection', frame)

    # Exit on key press
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Cleanup
video_cap.release()
cv2.destroyAllWindows()
pygame.mixer.music.stop()  # Ensure sound stops when the program ends
