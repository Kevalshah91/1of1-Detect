import React from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

export default function HomeScreen({ navigation }) {
  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        console.log('User signed out!');
      })
      .catch((error) => {
        console.error('Error signing out: ', error);
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to PedalAI! 🚴‍♂️</Text>
      <Text style={styles.subtitle}>You're logged in as {auth.currentUser.email}</Text>

      <TouchableOpacity 
        style={styles.mapButton} 
        onPress={() => navigation.navigate('Map')}
      >
        
        <Text style={styles.buttonText}>Open Maps</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.mapButton} 
        onPress={() => navigation.navigate('Gyroscope')}
      >
        
        <Text style={styles.buttonText}>Gyroscope</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={handleLogout}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 30,
    color: '#666',
  },
  mapButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginBottom: 15,
  },
  logoutButton: {
    backgroundColor: '#FF6347',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
