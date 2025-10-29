/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import '@react-native-firebase/app';
import App from './App';
import { name as appName } from './app.json';

// Register background message handler at the top level
// This MUST be done outside of any component/function
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background notification received:', remoteMessage);

  try {
    // Create notification channel
    await notifee.createChannel({
      id: 'scoreboard_actions',
      name: 'Scoreboard Actions',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });

    // Display notification with actions based on type
    if (remoteMessage.data?.type === 'new_scoreboard') {
      await notifee.displayNotification({
        title: remoteMessage.data.title,
        body: remoteMessage.data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: '✅ Accept',
              pressAction: { id: 'accept', launchActivity: 'default' },
            },
            {
              title: '❌ Reject',
              pressAction: { id: 'reject', launchActivity: 'default' },
            },
          ],
        },
        data: remoteMessage.data,
      });
    } else if (remoteMessage.data?.type === 'pending_point_added') {
      await notifee.displayNotification({
        title: remoteMessage.data.title,
        body: remoteMessage.data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: '✓ Confirm',
              pressAction: { id: 'confirm_point', launchActivity: 'default' },
            },
            {
              title: '✗ Reject',
              pressAction: { id: 'reject_point', launchActivity: 'default' },
            },
          ],
        },
        data: remoteMessage.data,
      });
    } else if (remoteMessage.data?.type === 'pending_beer_repayment') {
      await notifee.displayNotification({
        title: remoteMessage.data.title,
        body: remoteMessage.data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: '✓ Confirm',
              pressAction: { id: 'confirm_repayment', launchActivity: 'default' },
            },
            {
              title: '✗ Reject',
              pressAction: { id: 'reject_repayment', launchActivity: 'default' },
            },
          ],
        },
        data: remoteMessage.data,
      });
    } else if (remoteMessage.data?.type === 'pending_reset') {
      await notifee.displayNotification({
        title: remoteMessage.data.title,
        body: remoteMessage.data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: '✓ Confirm',
              pressAction: { id: 'confirm_reset', launchActivity: 'default' },
            },
            {
              title: '✗ Reject',
              pressAction: { id: 'reject_reset', launchActivity: 'default' },
            },
          ],
        },
        data: remoteMessage.data,
      });
    }
  } catch (error) {
    console.error('Error displaying background notification:', error);
  }
});

// Handle background notification actions
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('Background event:', type, detail);
  // The actual action handling is done in App.tsx
  // This just ensures the event system is active
});

AppRegistry.registerComponent(appName, () => App);
