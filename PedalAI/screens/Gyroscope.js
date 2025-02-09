import React, { useState, useEffect } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Gyroscope } from 'expo-sensors';
import * as Network from 'expo-network';
import * as Location from 'expo-location';
import Base64 from 'base-64';

// Replace with your Twilio credentials
const TWILIO_ACCOUNT_SID = 'AC46f0f043d3a35f1ddb9612e92299b86f';
const TWILIO_AUTH_TOKEN = '70ab2d061d88aa14b3381dd44c3f6e52';
const TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
 // Your Twilio WhatsApp number
const EMERGENCY_CONTACT = '918591884604';  // Add the contact number here without '+'

const SERVER_URL = 'http://10.10.60.99:5000';
const FALL_THRESHOLD = 5.0;
const TIME_WINDOW = 500;

const GyroscopeComponent = () => {
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [subscription, setSubscription] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [serverStatus, setServerStatus] = useState('Connecting...');
  let lastHighAcceleration = 0;

  const sendWhatsAppMessage = async () => {
    try {
      const location = await getCurrentLocation();
      const message = `EMERGENCY: Fall detected! Location: ${location.latitude}, ${location.longitude}. Please check immediately!`;
      
      const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

      // Format the emergency contact number correctly
      const formattedNumber = EMERGENCY_CONTACT.startsWith('+') ? 
        EMERGENCY_CONTACT : 
        `+${EMERGENCY_CONTACT}`;

      // Create the form data
      const formData = new URLSearchParams();
      formData.append('From', TWILIO_WHATSAPP_NUMBER);
      formData.append('To', `whatsapp:${formattedNumber}`);
      formData.append('Body', message);

      const auth = Base64.encode(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

      const response = await fetch(twilioEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`,
        },
        body: formData.toString()
      });

      const responseData = await response.text();
      console.log('Twilio Response:', responseData);

      if (!response.ok) {
        throw new Error(`Failed to send WhatsApp message: ${responseData}`);
      }

      console.log('WhatsApp message sent successfully');
      Alert.alert(
        'SOS Message Sent',
        'Emergency contact has been notified via WhatsApp',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      Alert.alert(
        'Message Error',
        'Failed to send emergency message. Please check manually.',
        [{ text: 'OK' }]
      );
    }
};
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return { latitude: 'Unknown', longitude: 'Unknown' };
    }
  };

  const makeRequest = async (endpoint) => {
    try {
      console.log(`Making request to: ${SERVER_URL}/${endpoint}`);
      
      const response = await fetch(`${SERVER_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log(`Response status: ${response.status}`);
      const data = await response.json();
      console.log(`Response data:`, data);

      return data;
    } catch (error) {
      console.error(`Error in ${endpoint}:`, error);
      setServerStatus('Server Error');
      throw error;
    }
  };

  const startMonitoring = async () => {
    try {
      setServerStatus('Connecting...');
      await makeRequest('start');
      setIsMonitoring(true);
      setServerStatus('Connected');
      console.log('Monitoring started successfully');
    } catch (error) {
      setServerStatus('Connection Failed');
      Alert.alert(
        'Connection Error',
        'Could not connect to the server. Please check the server IP address and ensure the server is running.',
        [{ text: 'OK' }]
      );
    }
  };

  const stopMonitoring = async () => {
    try {
      await makeRequest('stop');
      setIsMonitoring(false);
    } catch (error) {
      console.error('Stop monitoring error:', error);
    }
  };

  const reportFall = async () => {
    try {
      await makeRequest('accident');
      await sendWhatsAppMessage();  // Send WhatsApp message after reporting fall
      console.log('Fall reported and emergency contact notified');
    } catch (error) {
      console.error('Error reporting fall:', error);
      Alert.alert(
        'Error',
        'Could not report fall to server. Please check your connection.',
        [{ text: 'OK' }]
      );
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
      Alert.alert(
        "Fall Detected",
        "A fall has been detected. Recording incident...",
        [{ text: "OK" }]
      );
      reportFall();
      lastHighAcceleration = 0;
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected) {
        startMonitoring();
      } else {
        setServerStatus('No Network');
      }
    };

    initializeApp();

    setSubscription(
      Gyroscope.addListener(data => {
        setGyroscopeData(data);
        detectFall(data);
      })
    );
    
    Gyroscope.setUpdateInterval(100);

    return () => {
      subscription && subscription.remove();
      stopMonitoring();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fall Detection System</Text>
      <Text style={[
        styles.status,
        { color: serverStatus === 'Connected' ? 'green' : 'red' }
      ]}>
        Status: {serverStatus}
      </Text>
      <View style={styles.readings}>
        <Text style={styles.readingTitle}>Gyroscope Readings:</Text>
        <Text>X: {gyroscopeData.x.toFixed(2)}</Text>
        <Text>Y: {gyroscopeData.y.toFixed(2)}</Text>
        <Text>Z: {gyroscopeData.z.toFixed(2)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: '500',
  },
  readings: {
    marginTop: 20,
    alignItems: 'center',
  },
  readingTitle: {
    fontSize: 18,
    marginBottom: 10,
  },
});

export default GyroscopeComponent;