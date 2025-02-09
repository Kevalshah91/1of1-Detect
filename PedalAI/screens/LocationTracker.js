import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
 
const API_URL = 'http://10.10.60.99:3000/api'; // Replace with your actual API URL
const STATIC_USER_ID = 'user@example.com'; // Replace with your static user email
 
const LocationTracker = () => {
  const [location, setLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [speed, setSpeed] = useState(0);
  const previousLocations = useRef([]);
  const locationUpdateInterval = useRef(null);  
 
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
 
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
 
    return R * c;
  };
 
  const updateLocationInDB = async (latitude, longitude, speed) => {
    try {
      const response = await fetch(`${API_URL}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: STATIC_USER_ID,
          latitude,
          longitude,
          speed,
        }),
      });
 
      if (!response.ok) {
        throw new Error('Failed to update location in database');
      }
    } catch (error) {
      console.error('Error updating location:', error);
      Alert.alert('Error', 'Failed to update location. Please check your connection.');
    }
  };
 
  const hasLocationChanged = (newLocation) => {
    if (previousLocations.current.length < 10) return true;
 
    const lastTenLocations = previousLocations.current.slice(-10);
    const allSameLocation = lastTenLocations.every(loc =>
      loc.latitude === lastTenLocations[0].latitude &&
      loc.longitude === lastTenLocations[0].longitude
    );
 
    return !allSameLocation;
  };
 
  const calculateSpeed = (newLocation) => {
    if (previousLocations.current.length === 0) return 0;
 
    const previousLocation = previousLocations.current[previousLocations.current.length - 1];
    const timeDiff = (newLocation.timestamp - previousLocation.timestamp) / 1000;
    const distance = calculateDistance(
      previousLocation.latitude,
      previousLocation.longitude,
      newLocation.latitude,
      newLocation.longitude
    );
 
    return (distance / timeDiff) * 3.6;
  };
 
  const fetchRouteHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/location/${STATIC_USER_ID}`);
      if (!response.ok) {
        throw new Error('Failed to fetch route history');
      }
     
      const data = await response.json();
      if (data.length > 0) {
        setRouteCoordinates(data.map(loc => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        })));
      }
    } catch (error) {
      console.error('Error fetching route history:', error);
    }
  };
 
  useEffect(() => {
    fetchRouteHistory();
   
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required for this app.');
        return;
      }
 
      locationUpdateInterval.current = setInterval(async () => {
        try {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
 
          const newLocation = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            timestamp: currentLocation.timestamp,
          };
 
          if (hasLocationChanged(newLocation)) {
            const currentSpeed = calculateSpeed(newLocation);
            setLocation(newLocation);
            setRouteCoordinates(prev => [...prev, newLocation]);
            setSpeed(currentSpeed);
            await updateLocationInDB(newLocation.latitude, newLocation.longitude, currentSpeed);
          }
 
          previousLocations.current = [...previousLocations.current, newLocation].slice(-10);
        } catch (error) {
          console.error('Error getting location:', error);
        }
      }, 1000);
    })();
 
    return () => {
      if (locationUpdateInterval.current) {
        clearInterval(locationUpdateInterval.current);
      }
    };
  }, []);
 
  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Waiting for location...</Text>
      </View>
    );
  }
 
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          title="Current Location"
        />
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#000"
          strokeWidth={3}
        />
      </MapView>
      <View style={styles.speedContainer}>
        <Text style={styles.speedText}>
          Speed: {speed.toFixed(1)} km/h
        </Text>
      </View>
    </View>
  );
};
 
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
  },
  speedContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  speedText: {
    fontSize: 18,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
 
export default LocationTracker;