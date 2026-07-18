import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSubscription } from '../hooks/useSubscription';

export default function SubscriptionScreen() {
  const {
    isPlusUser,
    productId,
    expiresAt,
    loading,
    purchasing,
    error,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
  } = useSubscription();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tryggd Plus</Text>

      {isPlusUser ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusActive}>Active subscription</Text>
          {productId && <Text style={styles.detail}>Plan: {productId}</Text>}
          {expiresAt && (
            <Text style={styles.detail}>
              Renews: {new Date(expiresAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.statusBox}>
          <Text style={styles.statusInactive}>No active subscription</Text>

          <TouchableOpacity
            style={[styles.button, purchasing && styles.buttonDisabled]}
            onPress={purchaseMonthly}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Monthly</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonAnnual, purchasing && styles.buttonDisabled]}
            onPress={purchaseAnnual}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Annual</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity onPress={restorePurchases} disabled={purchasing}>
        <Text style={styles.restore}>Restore purchases</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 24, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32 },
  statusBox: { width: '100%', alignItems: 'center', gap: 12, marginBottom: 24 },
  statusActive: { fontSize: 18, fontWeight: '600', color: '#22c55e' },
  statusInactive: { fontSize: 18, color: '#6b7280', marginBottom: 8 },
  detail: { fontSize: 14, color: '#6b7280' },
  button: {
    width: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonAnnual: { backgroundColor: '#8b5cf6' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ef4444', marginBottom: 16, textAlign: 'center' },
  restore: { color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' },
});
