import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from './firebaseConfig';
import MapScreen from './screens/Map';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import GyroscopeComponent from './screens/Gyroscope';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <NavigationContainer>
      {user ? (
        // Authenticated stack
        <Stack.Navigator>
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen}
          />
          <Stack.Screen 
            name="Gyroscope" 
            component={GyroscopeComponent}
          />
        </Stack.Navigator>
      ) : (
        // Non-authenticated stack
        <Stack.Navigator>
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Signup" 
            component={SignupScreen}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}