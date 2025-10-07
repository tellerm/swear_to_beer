import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';

class NotificationService {
  async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Notification permission denied');
            return false;
          }
        }
      } else {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
          console.log('Notification permission denied');
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  async createNotificationChannel() {
    await notifee.createChannel({
      id: 'scoreboard_actions',
      name: 'Scoreboard Actions',
      importance: AndroidImportance.HIGH,
    });
  }

  async displayNotificationWithActions(data: any) {
    await this.createNotificationChannel();

    if (data.type === 'new_scoreboard') {
      await notifee.displayNotification({
        title: data.title,
        body: data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
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
        data: {
          scoreboardId: data.scoreboardId,
          scoreboardName: data.scoreboardName,
          type: data.type,
        },
      });
    } else if (data.type === 'pending_point_added') {
      await notifee.displayNotification({
        title: data.title,
        body: data.body,
        android: {
          channelId: 'scoreboard_actions',
          importance: AndroidImportance.HIGH,
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
        data: {
          scoreboardId: data.scoreboardId,
          scoreboardName: data.scoreboardName,
          changeId: data.changeId,
          type: data.type,
        },
      });
    }
  }

  async setupNotifications(
    onMessageReceived: (message: any) => void,
    onActionPress: (action: string, data: any) => void
  ) {
    // Create notification channel
    await this.createNotificationChannel();

    // Handle foreground messages
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('Foreground notification:', remoteMessage);
      if (remoteMessage.data?.type === 'new_scoreboard' || remoteMessage.data?.type === 'pending_point_added') {
        await this.displayNotificationWithActions(remoteMessage.data);
      }
      onMessageReceived(remoteMessage);
    });

    // Handle background/quit state messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Background notification:', remoteMessage);
      if (remoteMessage.data?.type === 'new_scoreboard' || remoteMessage.data?.type === 'pending_point_added') {
        await this.displayNotificationWithActions(remoteMessage.data);
      }
    });

    // Handle notification action press
    notifee.onBackgroundEvent(async ({type, detail}) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        onActionPress(detail.pressAction.id, detail.notification?.data);
      }
    });

    return unsubscribe;
  }
}

export default new NotificationService();
