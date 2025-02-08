import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password should be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      console.log('User account created successfully!');
      // Navigate to your main app screen here
    } catch (error) {
      let errorMessage = 'Failed to create account';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email already registered';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak';
          break;
        default:
          errorMessage = error.message;
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Organic shapes background */}
      <View style={styles.purpleShape} />
      <View style={styles.yellowShape} />
      <View style={styles.pinkShape} />
      
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={24} color="#000" />
      </TouchableOpacity>

      <View style={styles.contentContainer}>
        <Text style={styles.title}>Create{'\n'}Account</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#999"
            placeholder="At least 6 characters"
          />
        </View>

        <TouchableOpacity 
          style={[styles.signUpButton, loading && styles.disabledButton]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.signUpText}>{loading ? 'Creating Account...' : 'Sign up'}</Text>
          {!loading && (
            <View style={styles.arrowContainer}>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  purpleShape: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: width * 0.8,
    height: height * 0.4,
    backgroundColor: '#7B68EE',
    borderRadius: 200,
    transform: [{ rotate: '15deg' }],
  },
  yellowShape: {
    position: 'absolute',
    top: -150,
    right: -100,
    width: width * 0.8,
    height: height * 0.4,
    backgroundColor: '#F0E68C',
    borderRadius: 200,
    opacity: 0.6,
    transform: [{ rotate: '-15deg' }],
  },
  pinkShape: {
    position: 'absolute',
    top: -50,
    left: -150,
    width: width * 0.8,
    height: height * 0.3,
    backgroundColor: '#FFB6C1',
    borderRadius: 200,
    opacity: 0.5,
    transform: [{ rotate: '30deg' }],
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: height * 0.2,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#333',
    marginBottom: 40,
    lineHeight: 40,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
    fontSize: 16,
    color: '#333',
  },
  signUpButton: {
    backgroundColor: '#7B68EE',
    borderRadius: 30,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  signUpText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
    marginRight: 4,
  },
  footerLink: {
    color: '#7B68EE',
    fontSize: 14,
    fontWeight: '600',
  },
});