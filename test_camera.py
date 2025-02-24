import cv2

cap = cv2.VideoCapture(0)  # Try 1, 2, 3 if needed

if not cap.isOpened():
    print("Camera not found. Try changing index (0, 1, 2, etc.).")
else:
    print("Camera found!")
    ret, frame = cap.read()
    if ret:
        cv2.imshow("Camera Test", frame)
        cv2.waitKey(3000)  # Display for 3 seconds
    else:
        print("Camera detected, but failed to capture frame.")

cap.release()
cv2.destroyAllWindows()
