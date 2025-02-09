import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Dimensions, Alert, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import hazardData from './data.json';

class PriorityQueue {
  constructor() {
    this.values = [];
  }

  enqueue(node, priority) {
    this.values.push({ node, priority });
    this.sort();
  }

  dequeue() {
    return this.values.shift();
  }

  sort() {
    this.values.sort((a, b) => a.priority - b.priority);
  }
}

const SafeNavigationMap = () => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedEnd, setSelectedEnd] = useState(null);
  const [route, setRoute] = useState([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const [nearbyHazardsNotified, setNearbyHazardsNotified] = useState(new Set());
  const [locationSubscription, setLocationSubscription] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = async (text) => {
    try {
      if (isSpeaking) {
        await Speech.stop();
      }

      const options = {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.9,
        onStart: () => setIsSpeaking(true),
        onDone: () => setIsSpeaking(false),
        onError: (error) => {
          console.error('Speech Error:', error);
          setIsSpeaking(false);
        }
      };

      await Speech.speak(text, options);
    } catch (error) {
      console.error('Speech synthesis error:', error);
    }
  };

  const speakAlert = (title, message) => {
    Alert.alert(title, message);
    speak(`${title}. ${message}`);
  };

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          const message = 'Permission to access location was denied';
          setErrorMsg(message);
          speakAlert('Permission Denied', 'Please enable location services.');
          return;
        }

        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(currentLocation);
        speak('Location services initialized successfully');

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 10,
          },
          (newLocation) => {
            setLocation(newLocation);
            if (isNavigating) {
              checkForHazards(newLocation.coords.latitude, newLocation.coords.longitude);
            }
          }
        );

        setLocationSubscription(subscription);

        return () => {
          if (locationSubscription) {
            locationSubscription.remove();
          }
          Speech.stop();
        };
      } catch (error) {
        console.error('Error:', error);
        speakAlert('Error', 'Failed to initialize map: ' + error.message);
      }
    })();
  }, [isNavigating]);

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

  const calculateHeuristic = (point1, point2) => {
    return calculateDistance(
      point1.latitude || point1.Latitude,
      point1.longitude || point1.Longitude,
      point2.latitude || point2.Latitude,
      point2.longitude || point2.Longitude
    );
  };

  const calculateRiskScore = (point) => {
    const normalizedPotholes = point.Potholes / 10;
    const normalizedBarricades = point.Barricades;
    const normalizedVisibility = 1 - (point.Visibility / 5000);
    const normalizedVehicles = (point["Big Vehicles"] + point["Parked Vehicles"]) / 50;

    return (normalizedPotholes * 0.3 + 
            normalizedBarricades * 0.2 + 
            normalizedVisibility * 0.3 + 
            normalizedVehicles * 0.2) * 100;
  };

  const findNearestPoint = (coord, points) => {
    let nearest = null;
    let minDistance = Infinity;

    points.forEach((point, index) => {
      const distance = calculateDistance(
        coord.latitude,
        coord.longitude,
        point.Latitude,
        point.Longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = { point, index };
      }
    });

    return nearest;
  };

  const checkForHazards = (lat, lon) => {
    const nearbyHazards = hazardData.filter(point => {
      const distance = calculateDistance(lat, lon, point.Latitude, point.Longitude);
      return distance < 200;
    });

    nearbyHazards.forEach(hazard => {
      const hazardId = `${hazard.Latitude}-${hazard.Longitude}`;
      
      if (!nearbyHazardsNotified.has(hazardId)) {
        let warnings = [];

        if (hazard.Potholes > 5) warnings.push(`Warning: ${hazard.Potholes} potholes ahead`);
        if (hazard.Barricades > 0) warnings.push('Caution: Barricades present');
        if (hazard.Visibility < 2000) warnings.push('Warning: Low visibility area');
        if (hazard["Big Vehicles"] > 10) warnings.push('Heavy vehicle traffic ahead');
        if (hazard["Parked Vehicles"] > 20) warnings.push('High parking congestion');

        if (warnings.length > 0) {
          const warningMessage = warnings.join('. ');
          speakAlert('Hazard Alert', warningMessage);
          setNearbyHazardsNotified(prev => new Set([...prev, hazardId]));
        }
      }
    });
  };

  const findSafestRoute = (start, end) => {
    if (!start || !end) return [];

    const graph = new Map();
    const maxConnectionDistance = 500;

    hazardData.forEach((point, index) => {
      graph.set(index, {
        point,
        connections: new Map(),
        riskScore: calculateRiskScore(point)
      });
    });

    hazardData.forEach((point1, i) => {
      hazardData.forEach((point2, j) => {
        if (i !== j) {
          const distance = calculateDistance(
            point1.Latitude,
            point1.Longitude,
            point2.Latitude,
            point2.Longitude
          );

          if (distance <= maxConnectionDistance) {
            const avgRiskScore = (calculateRiskScore(point1) + calculateRiskScore(point2)) / 2;
            const weight = distance * (1 + avgRiskScore / 50);
            graph.get(i).connections.set(j, weight);
          }
        }
      });
    });

    const startNode = findNearestPoint(start, hazardData);
    const endNode = findNearestPoint(end, hazardData);

    if (!startNode || !endNode) return [start, end];

    const openSet = new PriorityQueue();
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    graph.forEach((_, index) => {
      gScore.set(index, Infinity);
      fScore.set(index, Infinity);
    });

    gScore.set(startNode.index, 0);
    fScore.set(startNode.index, calculateHeuristic(startNode.point, endNode.point));
    openSet.enqueue(startNode.index, fScore.get(startNode.index));

    while (openSet.values.length > 0) {
      const current = openSet.dequeue().node;

      if (current === endNode.index) {
        const path = [end];
        let currentNode = current;

        while (cameFrom.has(currentNode)) {
          currentNode = cameFrom.get(currentNode);
          path.unshift({
            latitude: hazardData[currentNode].Latitude,
            longitude: hazardData[currentNode].Longitude
          });
        }

        path.unshift(start);
        return path;
      }

      closedSet.add(current);
      const currentNode = graph.get(current);

      currentNode.connections.forEach((weight, neighbor) => {
        if (closedSet.has(neighbor)) return;

        const tentativeGScore = gScore.get(current) + weight;

        if (tentativeGScore < gScore.get(neighbor)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeGScore);
          fScore.set(neighbor, gScore.get(neighbor) + calculateHeuristic(
            hazardData[neighbor],
            endNode.point
          ));

          const existingNeighbor = openSet.values.find(v => v.node === neighbor);
          if (!existingNeighbor) {
            openSet.enqueue(neighbor, fScore.get(neighbor));
          }
        }
      });
    }

    return [start, end];
  };

  const smoothRoute = (route, smoothingFactor = 0.5) => {
    if (route.length <= 2) return route;

    const smoothedRoute = [route[0]];
    
    for (let i = 1; i < route.length - 1; i++) {
      const prev = route[i - 1];
      const current = route[i];
      const next = route[i + 1];

      const smoothedPoint = {
        latitude: current.latitude * (1 - smoothingFactor) +
                 (prev.latitude + next.latitude) / 2 * smoothingFactor,
        longitude: current.longitude * (1 - smoothingFactor) +
                  (prev.longitude + next.longitude) / 2 * smoothingFactor
      };

      smoothedRoute.push(smoothedPoint);
    }

    smoothedRoute.push(route[route.length - 1]);
    return smoothedRoute;
  };

  const handleSetStart = async () => {
    if (location) {
      const startLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
      setSelectedStart(startLocation);
      speak('Start location set to current position');
      
      if (mapRef) {
        mapRef.animateToRegion({
          ...startLocation,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }
    } else {
      speakAlert('Error', 'Unable to get current location');
    }
  };

  const handleSetDestination = () => {
    if (!selectedStart) {
      speakAlert('Error', 'Please set start location first');
      return;
    }

    const lastPoint = hazardData[hazardData.length - 1];
    const destination = {
      latitude: lastPoint.Latitude,
      longitude: lastPoint.Longitude
    };
    setSelectedEnd(destination);
    
    const rawRoute = findSafestRoute(selectedStart, destination);
    const smoothedRoute = smoothRoute(rawRoute);
    setRoute(smoothedRoute);
    setIsNavigating(true);
    
    speak('Route calculated. Navigation starting. Please proceed carefully.');
    
    if (mapRef && smoothedRoute.length > 0) {
      mapRef.fitToCoordinates(smoothedRoute, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  const resetNavigation = () => {
    setSelectedStart(null);
    setSelectedEnd(null);
    setRoute([]);
    setIsNavigating(false);
    setNearbyHazardsNotified(new Set());
    speak('Navigation reset. All markers and routes cleared.');
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={ref => setMapRef(ref)}
        style={styles.map}
        showsUserLocation={true}
        showsMyLocationButton={true}
        followsUserLocation={isNavigating}
        showsCompass={true}
        scrollEnabled={true}
        zoomEnabled={true}
        pitchEnabled={true}
        rotateEnabled={true}
        initialRegion={{
          latitude: location?.coords?.latitude || 19.11889,
          longitude: location?.coords?.longitude || 72.82115,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {selectedStart && (
          <Marker
            coordinate={selectedStart}
            pinColor="green"
            title="Start Location"
          />
        )}
        
        {selectedEnd && (
          <Marker
            coordinate={selectedEnd}
            pinColor="red"
            title="Destination"
          />
        )}

        {hazardData.map((point, index) => (
          <Marker
            key={index}
            coordinate={{
              latitude: point.Latitude,
              longitude: point.Longitude
            }}
            pinColor="yellow"
            title={`Risk Score: ${calculateRiskScore(point).toFixed(1)}`}
            description={`Potholes: ${point.Potholes}, Barricades: ${point.Barricades}`}
          />
        ))}

        {route.length > 0 && (
          <Polyline
            coordinates={route}
            strokeColor="#000"
            strokeWidth={3}
          />
        )}
      </MapView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.button}
          onPress={handleSetStart}
        >
          <Text style={styles.buttonText}>Set Start Location</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.button}
          onPress={handleSetDestination}
        >
          <Text style={styles.buttonText}>Set Destination</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.resetButton]}
          onPress={resetNavigation}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

export default SafeNavigationMap;