/**
 * Swear Jar Scoreboard App
 * A scoreboard for tracking swear points between friends
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import firebaseService, { User, Scoreboard, Player, PendingPointChange } from './firebaseService';
import notificationService from './notificationService';
import notifee, { EventType } from '@notifee/react-native';

type Screen = 'login' | 'main' | 'scoreboard' | 'createScoreboard';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedScoreboard, setSelectedScoreboard] = useState<Scoreboard | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [scoreboards, setScoreboards] = useState<Scoreboard[]>([]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (currentUser) {
      unsubscribe = firebaseService.subscribeToScoreboards(currentUser.name, (newScoreboards) => {
        setScoreboards(newScoreboards);
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users = await firebaseService.getUsers();
        // Filter out the current user so they can't compete against themselves
        const otherUsers = users.filter(user => user.id !== currentUser?.id);
        setAvailableUsers(otherUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  // Handle notification action button presses
  useEffect(() => {
    const handleNotificationAction = async (action: string, data: any) => {
      if (!data?.scoreboardId) return;

      try {
        if (action === 'accept') {
          await firebaseService.acceptScoreboard(data.scoreboardId);
        } else if (action === 'reject') {
          await firebaseService.rejectScoreboard(data.scoreboardId);
          setTimeout(async () => {
            await firebaseService.deleteScoreboard(data.scoreboardId);
          }, 2000);
        } else if (action === 'confirm_point' && data.changeId) {
          console.log('Confirming point from notification:', data.changeId);
          await firebaseService.confirmPendingPointChange(data.scoreboardId, data.changeId);
          console.log('Successfully confirmed point from notification');
        } else if (action === 'reject_point' && data.changeId) {
          console.log('Rejecting point from notification:', data.changeId);
          await firebaseService.rejectPendingPointChange(data.scoreboardId, data.changeId);
        } else if (action === 'confirm_repayment' && data.repaymentId) {
          console.log('Confirming repayment from notification:', data.repaymentId);
          await firebaseService.confirmPendingBeerRepayment(data.scoreboardId, data.repaymentId);
          console.log('Successfully confirmed repayment from notification');
        } else if (action === 'reject_repayment' && data.repaymentId) {
          console.log('Rejecting repayment from notification:', data.repaymentId);
          await firebaseService.rejectPendingBeerRepayment(data.scoreboardId, data.repaymentId);
        } else if (action === 'confirm_reset') {
          console.log('Confirming reset from notification');
          await firebaseService.confirmPendingReset(data.scoreboardId);
          console.log('Successfully confirmed reset from notification');
        } else if (action === 'reject_reset') {
          console.log('Rejecting reset from notification');
          await firebaseService.rejectPendingReset(data.scoreboardId);
        }
      } catch (error: any) {
        console.error('Error handling notification action:', error);
        if (error.message === 'Pending change not found') {
          Alert.alert('Point Request No Longer Valid', 'This point request has been cancelled or already processed.');
        } else if (error.message === 'Scoreboard not found') {
          Alert.alert('Scoreboard Not Found', 'This scoreboard has been deleted.');
        }
      }
    };

    // Setup notification listeners
    const setupListeners = async () => {
      await notificationService.setupNotifications(
        (message) => {
          console.log('Message received:', message);
        },
        handleNotificationAction
      );

      // Handle foreground action presses
      return notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
          handleNotificationAction(
            detail.pressAction.id,
            detail.notification?.data
          );
        }
      });
    };

    setupListeners();
  }, []);

  const openScoreboard = (scoreboard: Scoreboard) => {
    setSelectedScoreboard(scoreboard);
    setCurrentScreen('scoreboard');
  };

  const goBack = () => {
    setCurrentScreen('main');
    setSelectedScoreboard(null);
  };

  const openCreateScoreboard = () => {
    setCurrentScreen('createScoreboard');
  };

  const createNewScoreboard = async (name: string, type: string, icon: string, competitor: User) => {
    try {
      const newScoreboard = {
        name: name,
        type: type,
        players: [
          { id: '1', name: currentUser!.name, score: 0, totalScore: 0 },
          { id: '2', name: competitor.name, score: 0, totalScore: 0 },
        ],
        createdAt: new Date(),
        createdBy: currentUser!.id,
        status: 'pending' as const,
      };
      await firebaseService.createScoreboard(newScoreboard);
      setCurrentScreen('main');
    } catch (error) {
      console.error('Error creating scoreboard:', error);
      Alert.alert('Error', 'Failed to create scoreboard. Please try again.');
    }
  };

  const handleLogin = async (user: User) => {
    try {
      // Request notification permission and get FCM token
      const hasPermission = await notificationService.requestPermission();
      if (hasPermission) {
        const fcmToken = await notificationService.getFCMToken();
        if (fcmToken) {
          user.fcmToken = fcmToken;
        }
      }

      // Create user in Firestore if logging in for the first time
      await firebaseService.createUser(user);
    } catch (error) {
      // User might already exist, that's okay
      console.log('User already exists or error creating user:', error);
    }
    setCurrentUser(user);
    setCurrentScreen('main');
  };

  const handleLogout = () => {
    setCurrentScreen('login');
    setCurrentUser(null);
    setAvailableUsers([]);
    setScoreboards([]);
    setSelectedScoreboard(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {currentScreen === 'login' ? (
          <LoginScreen onLogin={handleLogin} />
        ) : currentScreen === 'main' ? (
          <MainScreen
            scoreboards={scoreboards}
            onScoreboardPress={openScoreboard}
            currentUser={currentUser!}
            onLogout={handleLogout}
            onCreateScoreboard={openCreateScoreboard}
          />
        ) : currentScreen === 'createScoreboard' ? (
          <CreateScoreboardScreen
            currentUser={currentUser!}
            availableUsers={availableUsers}
            onBack={goBack}
            onCreateScoreboard={createNewScoreboard}
          />
        ) : (
          <ScoreboardScreen
            scoreboard={selectedScoreboard!}
            currentUser={currentUser!}
            onBack={goBack}
            onScoreboardUpdate={(updatedScoreboard) => {
              setScoreboards(prev =>
                prev.map(sb => sb.id === updatedScoreboard.id ? updatedScoreboard : sb)
              );
              setSelectedScoreboard(updatedScoreboard);
            }}
            onScoreboardDelete={(scoreboardId) => {
              setScoreboards(prev => prev.filter(sb => sb.id !== scoreboardId));
            }}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function LoginScreen({ onLogin }: {
  onLogin: (user: User) => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const containerStyle = [
    styles.container,
    {
      paddingTop: safeAreaInsets.top,
      paddingBottom: safeAreaInsets.bottom + 20,
    },
    isDarkMode ? styles.darkContainer : styles.lightContainer,
  ];

  const textStyle = isDarkMode ? styles.darkText : styles.lightText;

  const handleSubmit = async () => {
    if (isLogin) {
      if (email && password) {
        try {
          const user = await firebaseService.validateLogin(email, password);
          if (user) {
            onLogin(user);
          } else {
            Alert.alert('Error', 'Invalid email or password');
          }
        } catch (error) {
          console.error('Login error:', error);
          Alert.alert('Error', 'Failed to login. Please try again.');
        }
      } else {
        Alert.alert('Error', 'Please fill in all fields');
      }
    } else {
      if (name && email && password) {
        try {
          const existingUser = await firebaseService.getUserByEmail(email);
          if (existingUser) {
            Alert.alert('Error', 'An account with this email already exists');
            return;
          }
          const user: User = {
            id: Math.random().toString(),
            name: name,
            email: email,
            password: password,
          };
          onLogin(user);
        } catch (error) {
          console.error('Signup error:', error);
          Alert.alert('Error', 'Failed to create account. Please try again.');
        }
      } else {
        Alert.alert('Error', 'Please fill in all fields');
      }
    }
  };

  return (
    <View style={containerStyle}>
      <View style={styles.loginContainer}>
        <Text style={[styles.title, textStyle]}>📊 Scoreboard Hub</Text>
        <Text style={[styles.subtitle, textStyle]}>
          {isLogin ? 'Welcome back!' : 'Create your account'}
        </Text>

        <View style={styles.loginForm}>
          {!isLogin && (
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Name"
              placeholderTextColor={isDarkMode ? '#666' : '#999'}
              value={name}
              onChangeText={setName}
            />
          )}

          <TextInput
            style={[styles.input, isDarkMode && styles.inputDark]}
            placeholder="Email"
            placeholderTextColor={isDarkMode ? '#666' : '#999'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={[styles.input, isDarkMode && styles.inputDark]}
            placeholder="Password"
            placeholderTextColor={isDarkMode ? '#666' : '#999'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.loginButton} onPress={handleSubmit}>
            <Text style={styles.loginButtonText}>
              {isLogin ? 'Login' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsLogin(!isLogin)}
          >
            <Text style={[styles.switchText, textStyle]}>
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MainScreen({ scoreboards, onScoreboardPress, currentUser, onLogout, onCreateScoreboard }: {
  scoreboards: Scoreboard[];
  onScoreboardPress: (scoreboard: Scoreboard) => void;
  currentUser: User;
  onLogout: () => void;
  onCreateScoreboard: () => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  const containerStyle = [
    styles.container,
    {
      paddingTop: safeAreaInsets.top,
      paddingBottom: safeAreaInsets.bottom + 20,
    },
    isDarkMode ? styles.darkContainer : styles.lightContainer,
  ];

  const textStyle = isDarkMode ? styles.darkText : styles.lightText;

  const handleAcceptScoreboard = async (scoreboard: Scoreboard) => {
    try {
      await firebaseService.acceptScoreboard(scoreboard.id);
    } catch (error) {
      console.error('Error accepting scoreboard:', error);
      Alert.alert('Error', 'Failed to accept scoreboard. Please try again.');
    }
  };

  const handleRejectScoreboard = async (scoreboard: Scoreboard) => {
    Alert.alert(
      'Reject Scoreboard',
      `Are you sure you want to reject "${scoreboard.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update status first (triggers notification), then delete
              await firebaseService.rejectScoreboard(scoreboard.id);
              // Wait a moment for notification to be sent, then delete
              setTimeout(async () => {
                await firebaseService.deleteScoreboard(scoreboard.id);
              }, 2000);
            } catch (error) {
              console.error('Error rejecting scoreboard:', error);
              Alert.alert('Error', 'Failed to reject scoreboard.');
            }
          },
        },
      ]
    );
  };

  const showUserMenu = () => {
    Alert.alert(
      currentUser.name,
      currentUser.email,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );
  };

  return (
    <View style={containerStyle}>
      <View style={styles.header}>
        <TouchableOpacity onPress={showUserMenu} style={styles.userProfile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {currentUser.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, textStyle]}>📊 Scoreboard Hub</Text>
          <Text style={[styles.subtitle, textStyle]}>
            Track everything that matters!
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, textStyle]}>Active Scoreboards</Text>

          {scoreboards.map(scoreboard => (
            <TouchableOpacity
              key={scoreboard.id}
              style={[
                styles.scoreboardCard,
                scoreboard.status === 'pending' && styles.scoreboardCardPending
              ]}
              onPress={() => onScoreboardPress(scoreboard)}
            >
              <View style={styles.cardHeader}>
                <Text style={[
                  styles.cardTitle,
                  scoreboard.status === 'pending' && styles.pendingText
                ]}>{scoreboard.name}</Text>
                <Text style={styles.cardType}>
                  {scoreboard.status === 'pending' ? 'Pending' : scoreboard.type}
                </Text>
              </View>
              <View style={styles.cardStats}>
                {scoreboard.players.map(player => (
                  <View key={player.id} style={styles.playerStat}>
                    <Text style={[
                      styles.playerStatName,
                      scoreboard.status === 'pending' && styles.pendingText
                    ]}>{player.name}</Text>
                    <Text style={[
                      styles.playerStatScore,
                      scoreboard.status === 'pending' && styles.pendingText
                    ]}>{player.score}</Text>
                  </View>
                ))}
              </View>
              {scoreboard.status === 'pending' && scoreboard.createdBy !== currentUser.id && (
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptScoreboard(scoreboard)}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => handleRejectScoreboard(scoreboard)}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={[
        styles.footer,
        { paddingBottom: Math.max(safeAreaInsets.bottom, 15) + 10 },
        isDarkMode ? styles.footerDark : styles.footerLight
      ]}>
        <TouchableOpacity style={styles.startButton} onPress={onCreateScoreboard}>
          <Text style={styles.startButtonText}>+ Start Scoreboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CreateScoreboardScreen({ currentUser, availableUsers, onBack, onCreateScoreboard }: {
  currentUser: User;
  availableUsers: User[];
  onBack: () => void;
  onCreateScoreboard: (name: string, type: string, icon: string, competitor: User) => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const [scoreboardName, setScoreboardName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🤬');
  const [selectedCompetitor, setSelectedCompetitor] = useState<User | null>(null);

  const containerStyle = [
    styles.container,
    {
      paddingTop: safeAreaInsets.top,
    },
    isDarkMode ? styles.darkContainer : styles.lightContainer,
  ];

  const textStyle = isDarkMode ? styles.darkText : styles.lightText;

  const scoreboardIcons = ['🤬', '🍻', '🎯', '⚽', '🎮', '📚', '💪', '🏃', '🎵', '🍕'];

  const handleCreate = () => {
    if (!scoreboardName.trim()) {
      Alert.alert('Error', 'Please enter a scoreboard name');
      return;
    }
    if (!selectedCompetitor) {
      Alert.alert('Error', 'Please select a competitor');
      return;
    }

    onCreateScoreboard(
      scoreboardName.trim(),
      'general',
      selectedIcon,
      selectedCompetitor
    );
  };

  return (
    <View style={containerStyle}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, textStyle]}>📊 Create Scoreboard</Text>
          <Text style={[styles.subtitle, textStyle]}>
            Start competing with friends!
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, textStyle]}>Scoreboard Name</Text>
          <TextInput
            style={[styles.input, isDarkMode && styles.inputDark]}
            placeholder="Enter scoreboard name..."
            placeholderTextColor={isDarkMode ? '#666' : '#999'}
            value={scoreboardName}
            onChangeText={setScoreboardName}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, textStyle]}>Choose Icon</Text>
          <View style={styles.iconGrid}>
            {scoreboardIcons.map(icon => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconOption,
                  selectedIcon === icon && styles.iconOptionSelected
                ]}
                onPress={() => setSelectedIcon(icon)}
              >
                <Text style={styles.iconText}>{icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, textStyle]}>Select Competitor</Text>
          {availableUsers.length === 0 ? (
            <Text style={[styles.emptyText, textStyle]}>
              No other users available. Ask friends to sign up!
            </Text>
          ) : (
            availableUsers.map(user => (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.userOption,
                  selectedCompetitor?.id === user.id && styles.userOptionSelected
                ]}
                onPress={() => setSelectedCompetitor(user)}
              >
                <View style={styles.userOptionContent}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  {selectedCompetitor?.id === user.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[
        styles.footer,
        { paddingBottom: Math.max(safeAreaInsets.bottom, 15) + 10 },
        isDarkMode ? styles.footerDark : styles.footerLight
      ]}>
        <TouchableOpacity
          style={[
            styles.createButton,
            (!scoreboardName.trim() || !selectedCompetitor) && styles.createButtonDisabled
          ]}
          onPress={handleCreate}
          disabled={!scoreboardName.trim() || !selectedCompetitor}
        >
          <Text style={styles.createButtonText}>Create Scoreboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ScoreboardScreen({ scoreboard, currentUser, onBack, onScoreboardUpdate, onScoreboardDelete }: {
  scoreboard: Scoreboard;
  currentUser: User;
  onBack: () => void;
  onScoreboardUpdate: (scoreboard: Scoreboard) => void;
  onScoreboardDelete: (scoreboardId: string) => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  const [players, setPlayers] = useState<Player[]>(scoreboard.players);
  const [currentScoreboard, setCurrentScoreboard] = useState<Scoreboard>(scoreboard);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayingPlayer, setRepayingPlayer] = useState<{ id: string; name: string; score: number } | null>(null);
  const [repayAmount, setRepayAmount] = useState('');

  useEffect(() => {
    const unsubscribe = firebaseService.subscribeToScoreboard(scoreboard.id, (updatedScoreboard) => {
      if (updatedScoreboard) {
        setCurrentScoreboard(updatedScoreboard);
        setPlayers(updatedScoreboard.players);
        onScoreboardUpdate(updatedScoreboard);
      } else {
        // Scoreboard was deleted, navigate back
        onScoreboardDelete(scoreboard.id);
        onBack();
      }
    });

    return unsubscribe;
  }, [scoreboard.id, onScoreboardUpdate, onScoreboardDelete, onBack]);

  const addPoint = async (playerId: string, playerName: string) => {
    try {
      await firebaseService.addPendingPointChange(
        scoreboard.id,
        playerId,
        playerName,
        1,
        currentUser.id,
        currentUser.name
      );
    } catch (error) {
      console.error('Error adding pending point:', error);
      Alert.alert('Error', 'Failed to add point. Please try again.');
    }
  };

  const repayBeers = (playerId: string, playerName: string, currentScore: number) => {
    if (currentScore <= 0) {
      Alert.alert('No Beers to Repay', `${playerName} doesn't owe any beers!`);
      return;
    }

    setRepayingPlayer({ id: playerId, name: playerName, score: currentScore });
    setRepayAmount('');
    setShowRepayModal(true);
  };

  const handleRepaySubmit = async () => {
    if (!repayingPlayer) return;

    const beersToRepay = parseInt(repayAmount, 10);

    if (isNaN(beersToRepay) || beersToRepay <= 0) {
      Alert.alert('Invalid Number', 'Please enter a valid number of beers.');
      return;
    }

    if (beersToRepay > repayingPlayer.score) {
      Alert.alert('Too Many Beers', `${repayingPlayer.name} only owes ${repayingPlayer.score} beer(s)!`);
      return;
    }

    try {
      await firebaseService.addPendingBeerRepayment(
        scoreboard.id,
        repayingPlayer.id,
        repayingPlayer.name,
        beersToRepay,
        currentUser.id,
        currentUser.name
      );
      setShowRepayModal(false);
      setRepayingPlayer(null);
      setRepayAmount('');
    } catch (error) {
      console.error('Error requesting beer repayment:', error);
      Alert.alert('Error', 'Failed to request beer repayment. Please try again.');
    }
  };

  const confirmPendingChange = async (changeId: string) => {
    try {
      console.log('Attempting to confirm pending change:', changeId);
      await firebaseService.confirmPendingPointChange(scoreboard.id, changeId);
      console.log('Successfully confirmed pending change:', changeId);
    } catch (error: any) {
      console.error('Error confirming pending change:', error);
      if (error.message === 'Pending change not found') {
        Alert.alert('Point Request No Longer Valid', 'This point request has been cancelled or already processed.');
      } else {
        Alert.alert('Error', 'Failed to confirm change. Please try again.');
      }
    }
  };

  const rejectPendingChange = async (changeId: string) => {
    try {
      console.log('Deleting pending change:', changeId);
      await firebaseService.rejectPendingPointChange(scoreboard.id, changeId);
      console.log('Successfully deleted pending change:', changeId);
    } catch (error) {
      console.error('Error rejecting pending change:', error);
      Alert.alert('Error', 'Failed to reject change. Please try again.');
    }
  };

  const confirmPendingRepayment = async (repaymentId: string) => {
    try {
      console.log('Attempting to confirm pending repayment:', repaymentId);
      await firebaseService.confirmPendingBeerRepayment(scoreboard.id, repaymentId);
      console.log('Successfully confirmed pending repayment:', repaymentId);
    } catch (error: any) {
      console.error('Error confirming pending repayment:', error);
      if (error.message === 'Pending repayment not found') {
        Alert.alert('Repayment Request No Longer Valid', 'This repayment request has been cancelled or already processed.');
      } else {
        Alert.alert('Error', 'Failed to confirm repayment. Please try again.');
      }
    }
  };

  const rejectPendingRepayment = async (repaymentId: string) => {
    try {
      console.log('Deleting pending repayment:', repaymentId);
      await firebaseService.rejectPendingBeerRepayment(scoreboard.id, repaymentId);
      console.log('Successfully deleted pending repayment:', repaymentId);
    } catch (error) {
      console.error('Error rejecting pending repayment:', error);
      Alert.alert('Error', 'Failed to reject repayment. Please try again.');
    }
  };

  const netOutScores = async () => {
    if (players.length !== 2) return;

    const score1 = players[0].score;
    const score2 = players[1].score;
    const minScore = Math.min(score1, score2);

    if (minScore === 0) {
      Alert.alert('Already Balanced', 'Scores are already at their net difference.');
      return;
    }

    Alert.alert(
      'Net Out Scores',
      `This will change scores from ${score1}:${score2} to ${score1 - minScore}:${score2 - minScore}. Continue?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Net Out',
          onPress: async () => {
            try {
              const updatedPlayers = players.map(player => ({
                ...player,
                score: player.score - minScore,
              }));
              await firebaseService.updateScoreboard(scoreboard.id, { players: updatedPlayers });
            } catch (error) {
              console.error('Error netting out scores:', error);
              Alert.alert('Error', 'Failed to net out scores. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    changeId: string
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => rejectPendingChange(changeId)}
      >
        <Animated.View style={[styles.deleteActionContent, { opacity: trans }]}>
          <Text style={styles.deleteActionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderRightActionsForRepayment = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    repaymentId: string
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => rejectPendingRepayment(repaymentId)}
      >
        <Animated.View style={[styles.deleteActionContent, { opacity: trans }]}>
          <Text style={styles.deleteActionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderRightActionsForReset = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => rejectPendingReset()}
      >
        <Animated.View style={[styles.deleteActionContent, { opacity: trans }]}>
          <Text style={styles.deleteActionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const resetScores = async () => {
    try {
      await firebaseService.addPendingReset(
        scoreboard.id,
        currentUser.id,
        currentUser.name
      );
    } catch (error) {
      console.error('Error requesting reset:', error);
      Alert.alert('Error', 'Failed to request reset. Please try again.');
    }
  };

  const confirmPendingReset = async () => {
    try {
      console.log('Attempting to confirm pending reset');
      await firebaseService.confirmPendingReset(scoreboard.id);
      console.log('Successfully confirmed pending reset');
    } catch (error: any) {
      console.error('Error confirming pending reset:', error);
      if (error.message === 'Pending reset not found') {
        Alert.alert('Reset Request No Longer Valid', 'This reset request has been cancelled or already processed.');
      } else {
        Alert.alert('Error', 'Failed to confirm reset. Please try again.');
      }
    }
  };

  const rejectPendingReset = async () => {
    try {
      console.log('Deleting pending reset');
      await firebaseService.rejectPendingReset(scoreboard.id);
      console.log('Successfully deleted pending reset');
    } catch (error) {
      console.error('Error rejecting pending reset:', error);
      Alert.alert('Error', 'Failed to reject reset. Please try again.');
    }
  };

  const leaveCompetition = () => {
    Alert.alert(
      'Leave Competition',
      'Are you sure you want to leave this competition? This will delete the scoreboard.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              // First remove current player from the scoreboard to trigger notification
              const remainingPlayers = players.filter(
                player => player.name !== currentUser.name
              );
              await firebaseService.updateScoreboard(scoreboard.id, {
                players: remainingPlayers
              });

              // Wait for notification to be sent, then delete the scoreboard
              setTimeout(async () => {
                await firebaseService.deleteScoreboard(scoreboard.id);
              }, 2000);

              onScoreboardDelete(scoreboard.id);
              onBack();
            } catch (error) {
              console.error('Error leaving scoreboard:', error);
              Alert.alert('Error', 'Failed to leave scoreboard. Please try again.');
            }
          },
        },
      ]
    );
  };

  const containerStyle = [
    styles.container,
    {
      paddingTop: safeAreaInsets.top,
      paddingBottom: safeAreaInsets.bottom + 20,
    },
    isDarkMode ? styles.darkContainer : styles.lightContainer,
  ];

  const textStyle = isDarkMode ? styles.darkText : styles.lightText;

  const handleAccept = async () => {
    try {
      await firebaseService.acceptScoreboard(scoreboard.id);
      onBack();
    } catch (error) {
      console.error('Error accepting scoreboard:', error);
      Alert.alert('Error', 'Failed to accept scoreboard. Please try again.');
    }
  };

  const handleReject = async () => {
    Alert.alert(
      'Reject Scoreboard',
      `Are you sure you want to reject "${currentScoreboard.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update status first (triggers notification), then delete
              await firebaseService.rejectScoreboard(scoreboard.id);
              onBack();
              // Wait a moment for notification to be sent, then delete
              setTimeout(async () => {
                await firebaseService.deleteScoreboard(scoreboard.id);
              }, 2000);
            } catch (error) {
              console.error('Error rejecting scoreboard:', error);
              Alert.alert('Error', 'Failed to reject scoreboard.');
            }
          },
        },
      ]
    );
  };

  // If scoreboard is pending, show accept/reject view
  if (currentScoreboard.status === 'pending') {
    return (
      <View style={containerStyle}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, textStyle]}>{currentScoreboard.name}</Text>
          <Text style={[styles.subtitle, textStyle]}>
            Pending Challenge
          </Text>
        </View>

        <View style={styles.scoreboard}>
          <View style={styles.pendingInfo}>
            <Text style={[styles.pendingInfoText, textStyle]}>
              You've been challenged to compete!
            </Text>
            <View style={styles.pendingPlayers}>
              {players && players.map(player => (
                <Text key={player.id} style={[styles.pendingPlayerName, textStyle]}>
                  {player.name}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={[
          styles.footer,
          { paddingBottom: Math.max(safeAreaInsets.bottom, 15) + 10 },
          isDarkMode ? styles.footerDark : styles.footerLight
        ]}>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.acceptButtonLarge} onPress={handleAccept}>
              <Text style={styles.acceptButtonText}>✓ Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectButtonLarge} onPress={handleReject}>
              <Text style={styles.rejectButtonText}>✗ Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Normal active scoreboard view
  return (
    <View style={containerStyle}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, textStyle]}>{currentScoreboard.name}</Text>
          <Text style={[styles.subtitle, textStyle]}>
            Points = Beers owed! 🍺
          </Text>
          <Text style={[styles.fullScore, textStyle]}>
            Full Score: {players[0]?.totalScore ?? players[0]?.score ?? 0}:{players[1]?.totalScore ?? players[1]?.score ?? 0}
          </Text>
        </View>

        {/* Players side by side */}
        <View style={styles.scoreboardRow}>
        {players && players.map(player => (
          <View key={player.id} style={styles.playerCard}>
            <Text style={styles.playerName}>{player.name}</Text>
            <Text style={styles.score}>{player.score}</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => addPoint(player.id, player.name)}
              >
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.beerButton}
                onPress={() => repayBeers(player.id, player.name, player.score)}
              >
                <Text style={styles.beerIcon}>🍺</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Pending Point Changes */}
      {currentScoreboard.pendingPointChanges && currentScoreboard.pendingPointChanges.length > 0 && (
        <View style={styles.pendingChangesContainer}>
          <Text style={styles.pendingChangesTitle}>⏳ Pending Point Changes</Text>
          {currentScoreboard.pendingPointChanges.map((change) => {
            const pendingCardContent = (
              <View style={styles.pendingChangeCard}>
                <Text style={styles.pendingChangeText}>
                  {change.addedByName} wants to add {change.points} point(s) to {change.playerName}
                </Text>
                {change.addedBy !== currentUser.id && (
                  <View style={styles.pendingChangeActions}>
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={() => confirmPendingChange(change.id)}
                    >
                      <Text style={styles.confirmButtonText}>✓ Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectChangeButton}
                      onPress={() => rejectPendingChange(change.id)}
                    >
                      <Text style={styles.rejectChangeButtonText}>✗ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {change.addedBy === currentUser.id && (
                  <Text style={styles.waitingText}>Waiting for confirmation... (Swipe left to cancel)</Text>
                )}
              </View>
            );

            // Only allow swipe-to-delete for changes the current user created
            if (change.addedBy === currentUser.id) {
              return (
                <Swipeable
                  key={change.id}
                  renderRightActions={(progress, dragX) =>
                    renderRightActions(progress, dragX, change.id)
                  }
                  overshootRight={false}
                >
                  {pendingCardContent}
                </Swipeable>
              );
            }

            return <View key={change.id}>{pendingCardContent}</View>;
          })}
        </View>
      )}

      {/* Pending Reset */}
      {currentScoreboard.pendingReset && (
        <View style={styles.pendingChangesContainer}>
          <Text style={styles.pendingChangesTitle}>🔄 Pending Reset Request</Text>
          {currentScoreboard.pendingReset.requestedBy === currentUser.id ? (
            <Swipeable
              renderRightActions={(progress, dragX) =>
                renderRightActionsForReset(progress, dragX)
              }
              overshootRight={false}
            >
              <View style={styles.pendingChangeCard}>
                <Text style={styles.pendingChangeText}>
                  {currentScoreboard.pendingReset.requestedByName} wants to reset the scoreboard to 0:0
                </Text>
                <Text style={styles.waitingText}>Waiting for confirmation... (Swipe left to cancel)</Text>
              </View>
            </Swipeable>
          ) : (
            <View style={styles.pendingChangeCard}>
              <Text style={styles.pendingChangeText}>
                {currentScoreboard.pendingReset.requestedByName} wants to reset the scoreboard to 0:0
              </Text>
              <View style={styles.pendingChangeActions}>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => confirmPendingReset()}
                >
                  <Text style={styles.confirmButtonText}>✓ Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectChangeButton}
                  onPress={() => rejectPendingReset()}
                >
                  <Text style={styles.rejectChangeButtonText}>✗ Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Pending Beer Repayments */}
      {currentScoreboard.pendingBeerRepayments && currentScoreboard.pendingBeerRepayments.length > 0 && (
        <View style={styles.pendingChangesContainer}>
          <Text style={styles.pendingChangesTitle}>🍺 Pending Beer Repayments</Text>
          {currentScoreboard.pendingBeerRepayments.map((repayment) => {
            const repaymentCardContent = (
              <View style={styles.pendingChangeCard}>
                <Text style={styles.pendingChangeText}>
                  {repayment.requestedByName} wants to repay {repayment.beers} beer(s) for {repayment.playerName}
                </Text>
                {repayment.requestedBy !== currentUser.id && (
                  <View style={styles.pendingChangeActions}>
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={() => confirmPendingRepayment(repayment.id)}
                    >
                      <Text style={styles.confirmButtonText}>✓ Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectChangeButton}
                      onPress={() => rejectPendingRepayment(repayment.id)}
                    >
                      <Text style={styles.rejectChangeButtonText}>✗ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {repayment.requestedBy === currentUser.id && (
                  <Text style={styles.waitingText}>Waiting for confirmation... (Swipe left to cancel)</Text>
                )}
              </View>
            );

            // Only allow swipe-to-delete for repayments the current user created
            if (repayment.requestedBy === currentUser.id) {
              return (
                <Swipeable
                  key={repayment.id}
                  renderRightActions={(progress, dragX) =>
                    renderRightActionsForRepayment(progress, dragX, repayment.id)
                  }
                  overshootRight={false}
                >
                  {repaymentCardContent}
                </Swipeable>
              );
            }

            return <View key={repayment.id}>{repaymentCardContent}</View>;
          })}
        </View>
      )}
      </ScrollView>

      <View style={[
        styles.footer,
        { paddingBottom: Math.max(safeAreaInsets.bottom, 15) + 10 },
        isDarkMode ? styles.footerDark : styles.footerLight
      ]}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.netOutButton} onPress={netOutScores}>
            <Text style={styles.netOutButtonText}>Net Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={resetScores}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leaveButton} onPress={leaveCompetition}>
            <Text style={styles.leaveButtonText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Repay Beers Modal */}
      <Modal
        visible={showRepayModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRepayModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🍺 Repay Beers</Text>
            <Text style={styles.modalSubtitle}>
              {repayingPlayer && `How many beers does ${repayingPlayer.name} want to repay?`}
            </Text>
            <Text style={styles.modalMaxText}>
              {repayingPlayer && `Max: ${repayingPlayer.score} beer(s)`}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter number of beers"
              keyboardType="numeric"
              value={repayAmount}
              onChangeText={setRepayAmount}
              autoFocus={true}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRepayModal(false);
                  setRepayingPlayer(null);
                  setRepayAmount('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalRepayButton}
                onPress={handleRepaySubmit}
              >
                <Text style={styles.modalRepayButtonText}>Repay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  lightContainer: {
    backgroundColor: '#f5f5f5',
  },
  darkContainer: {
    backgroundColor: '#1a1a1a',
  },
  lightText: {
    color: '#333',
  },
  darkText: {
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  fullScore: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 5,
  },
  scoreboard: {
    flex: 1,
    justifyContent: 'center',
    gap: 30,
  },
  scoreboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 15,
    marginBottom: 20,
  },
  playerCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  playerName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  score: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#e74c3c',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
  beerButton: {
    backgroundColor: '#fff',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#f39c12',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  beerIcon: {
    fontSize: 26,
  },
  netOutButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  netOutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 15,
    borderTopWidth: 1,
  },
  footerLight: {
    backgroundColor: '#f5f5f5',
    borderTopColor: '#e0e0e0',
  },
  footerDark: {
    backgroundColor: '#1a1a1a',
    borderTopColor: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
    justifyContent: 'center',
  },
  resetButton: {
    backgroundColor: '#95a5a6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  leaveButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  scoreboardCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  scoreboardCardPending: {
    backgroundColor: '#e0e0e0',
    opacity: 0.7,
  },
  pendingText: {
    color: '#888',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  rejectButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  acceptButtonLarge: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    flex: 1,
  },
  rejectButtonLarge: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    flex: 1,
  },
  pendingInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pendingInfoText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
  },
  pendingPlayers: {
    alignItems: 'center',
  },
  pendingPlayerName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cardType: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  playerStat: {
    alignItems: 'center',
  },
  playerStatName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  playerStatScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
  },
  startButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 10,
    zIndex: 1,
  },
  backButtonText: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: '500',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loginForm: {
    marginTop: 40,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputDark: {
    backgroundColor: '#333',
    borderColor: '#555',
    color: '#fff',
  },
  loginButton: {
    backgroundColor: '#3498db',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    opacity: 0.7,
  },
  userProfile: {
    position: 'absolute',
    right: 0,
    top: 5,
    zIndex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  iconText: {
    fontSize: 20,
  },
  userOption: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  userOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 15,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    opacity: 0.7,
    color: '#333',
  },
  checkmark: {
    fontSize: 18,
    color: '#3498db',
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#27ae60',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4.84,
    elevation: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#95a5a6',
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
    opacity: 0.6,
  },
  pendingChangesContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  pendingChangesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#d97706',
  },
  pendingChangeCard: {
    backgroundColor: '#fffbf0',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  pendingChangeText: {
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
  },
  pendingChangeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#28a745',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectChangeButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  rejectChangeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  waitingText: {
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.6,
    color: '#333',
  },
  deleteAction: {
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderRadius: 6,
    marginBottom: 8,
  },
  deleteActionContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
    color: '#555',
  },
  modalMaxText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#888',
    fontStyle: 'italic',
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 15,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#f39c12',
    color: '#f39c12',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#95a5a6',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalRepayButton: {
    flex: 1,
    backgroundColor: '#f39c12',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalRepayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
