import React, { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { Gyroscope } from 'expo-sensors';
import * as Camera from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import { Camera as ExpoCamera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';

const GyroscopeComponent = () => {
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [subscription, setSubscription] = useState(null);
  const [camera, setCamera] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(null);
  
  const EMERGENCY_NUMBER = '7304032169';
  const FALL_THRESHOLD = 5.0;
  const TIME_WINDOW = 500; // milliseconds
  let lastHighAcceleration = 0;
  
  // Request necessary permissions on component mount
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      
      setHasPermissions(
        cameraStatus === 'granted' && 
        mediaStatus === 'granted'
      );

      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        Alert.alert(
          "Permissions Required",
          "Please enable camera and media permissions in your device settings to use fall detection features.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request necessary permissions');
    }
  };

  // Function to call emergency number
  const callEmergencyNumber = () => {
    try {
      Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
    } catch (error) {
      console.error('Error making emergency call:', error);
      Alert.alert('Error', 'Failed to initiate emergency call');
    }
  };

  // Function to record video
  const recordEmergencyVideo = async () => {
    if (!camera) {
      console.error('Camera ref not available');
      return;
    }

    try {
      // Create assets directory if it doesn't exist
      const assetsDir = `${FileSystem.documentDirectory}assets`;
      const dirInfo = await FileSystem.getInfoAsync(assetsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(assetsDir, { intermediates: true });
      }

      // Start recording
      const videoRecord = await camera.recordAsync({
        maxDuration: 5,
        quality: Camera.Constants.VideoQuality['480p'],
      });

      // Save video to assets directory
      const fileName = `fall_${new Date().getTime()}.mp4`;
      const newPath = `${assetsDir}/${fileName}`;
      await FileSystem.moveAsync({
        from: videoRecord.uri,
        to: newPath,
      });

      // Save to device media library
      await MediaLibrary.saveToLibraryAsync(newPath);
      
      Alert.alert('Success', 'Emergency video recorded and saved');
    } catch (error) {
      console.error('Error recording video:', error);
      Alert.alert('Error', 'Failed to record emergency video');
    }
  };

  const handleEmergency = async () => {
    try {
      callEmergencyNumber();
      await recordEmergencyVideo();
    } catch (error) {
      console.error('Error handling emergency:', error);
      Alert.alert('Error', 'Failed to complete emergency procedures');
    }
  };

  const detectFall = (data) => {
    const magnitude = Math.sqrt(
      Math.pow(data.x, 2) + 
      Math.pow(data.y, 2) + 
      Math.pow(data.z, 2)
    );

    const currentTime = Date.now();
    
    if (magnitude > FALL_THRESHOLD) {
      lastHighAcceleration = currentTime;
    } else if (
      currentTime - lastHighAcceleration < TIME_WINDOW && 
      lastHighAcceleration !== 0
    ) {
      // Potential fall detected
      Alert.alert(
        "Fall Detected",
        "Are you okay? A potential fall has been detected.",
        [
          {
            text: "I'm OK",
            onPress: () => console.log("User is OK"),
            style: "cancel"
          },
          {
            text: "Need Help",
            onPress: handleEmergency
          }
        ]
      );
      lastHighAcceleration = 0;
    }
  };

  useEffect(() => {
    _subscribe();
    return () => _unsubscribe();
  }, []);

  const _subscribe = () => {
    setSubscription(
      Gyroscope.addListener(gyroscopeData => {
        setGyroscopeData(gyroscopeData);
        detectFall(gyroscopeData);
      })
    );
    
    Gyroscope.setUpdateInterval(100);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  if (hasPermissions === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Requesting permissions...</Text>
      </View>
    );
  }

  if (hasPermissions === false) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Camera and media permissions are required.</Text>
        <Text onPress={requestPermissions} style={{ color: 'blue', marginTop: 10 }}>
          Request Permissions
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Fall Detection Active</Text>
        <Text>Gyroscope:</Text>
        <Text>x: {gyroscopeData.x.toFixed(2)}</Text>
        <Text>y: {gyroscopeData.y.toFixed(2)}</Text>
        <Text>z: {gyroscopeData.z.toFixed(2)}</Text>
      </View>
      
      <ExpoCamera
        ref={ref => setCamera(ref)}
        style={{ height: 1, width: 1, opacity: 0 }}
        type={Camera.Constants.Type.back}
      />
    </View>
  );
};

export default GyroscopeComponent;