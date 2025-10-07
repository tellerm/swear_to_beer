import firestore from '@react-native-firebase/firestore';

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface PendingPointChange {
  id: string;
  playerId: string;
  playerName: string;
  points: number;
  addedBy: string;
  addedByName: string;
  timestamp: Date;
}

export interface Scoreboard {
  id: string;
  name: string;
  type: string;
  players: Player[];
  createdAt: Date;
  createdBy: string;
  status: 'pending' | 'active' | 'rejected';
  pendingPointChanges?: PendingPointChange[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  fcmToken?: string;
}

class FirebaseService {
  private usersCollection = firestore().collection('users');
  private scoreboardsCollection = firestore().collection('scoreboards');

  // User management
  async createUser(user: User): Promise<User> {
    try {
      // Use the user's id as the document ID to prevent duplicates
      await this.usersCollection.doc(user.id).set(user, { merge: true });
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getUsers(): Promise<User[]> {
    try {
      const snapshot = await this.usersCollection.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const snapshot = await this.usersCollection.where('email', '==', email).get();
      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      } as User;
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  async validateLogin(email: string, password: string): Promise<User | null> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user || user.password !== password) {
        return null;
      }
      return user;
    } catch (error) {
      console.error('Error validating login:', error);
      throw error;
    }
  }

  // Scoreboard management
  async createScoreboard(scoreboard: Omit<Scoreboard, 'id'>): Promise<Scoreboard> {
    try {
      const docRef = await this.scoreboardsCollection.add({
        ...scoreboard,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      const newScoreboard: Scoreboard = { ...scoreboard, id: docRef.id };
      return newScoreboard;
    } catch (error) {
      console.error('Error creating scoreboard:', error);
      throw error;
    }
  }

  async getScoreboards(): Promise<Scoreboard[]> {
    try {
      const snapshot = await this.scoreboardsCollection
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      }) as Scoreboard[];
    } catch (error) {
      console.error('Error getting scoreboards:', error);
      throw error;
    }
  }

  async updateScoreboard(scoreboardId: string, updates: Partial<Scoreboard>): Promise<void> {
    try {
      await this.scoreboardsCollection.doc(scoreboardId).update(updates);
    } catch (error) {
      console.error('Error updating scoreboard:', error);
      throw error;
    }
  }

  async deleteScoreboard(scoreboardId: string): Promise<void> {
    try {
      await this.scoreboardsCollection.doc(scoreboardId).delete();
    } catch (error) {
      console.error('Error deleting scoreboard:', error);
      throw error;
    }
  }

  async acceptScoreboard(scoreboardId: string): Promise<void> {
    try {
      await this.scoreboardsCollection.doc(scoreboardId).update({ status: 'active' });
    } catch (error) {
      console.error('Error accepting scoreboard:', error);
      throw error;
    }
  }

  async rejectScoreboard(scoreboardId: string): Promise<void> {
    try {
      await this.scoreboardsCollection.doc(scoreboardId).update({ status: 'rejected' });
    } catch (error) {
      console.error('Error rejecting scoreboard:', error);
      throw error;
    }
  }

  // Pending point changes
  async addPendingPointChange(
    scoreboardId: string,
    playerId: string,
    playerName: string,
    points: number,
    addedBy: string,
    addedByName: string
  ): Promise<void> {
    try {
      const pendingChange: PendingPointChange = {
        id: Date.now().toString(),
        playerId,
        playerName,
        points,
        addedBy,
        addedByName,
        timestamp: new Date(),
      };

      await this.scoreboardsCollection.doc(scoreboardId).update({
        pendingPointChanges: firestore.FieldValue.arrayUnion(pendingChange),
      });
    } catch (error) {
      console.error('Error adding pending point change:', error);
      throw error;
    }
  }

  async confirmPendingPointChange(scoreboardId: string, pendingChangeId: string): Promise<void> {
    try {
      // Fetch the scoreboard fresh to ensure we have the latest data
      const scoreboardDoc = await this.scoreboardsCollection.doc(scoreboardId).get();
      if (!scoreboardDoc.exists) {
        throw new Error('Scoreboard not found');
      }

      const scoreboard = scoreboardDoc.data() as Scoreboard;

      // Check if pendingPointChanges array exists and has items
      if (!scoreboard.pendingPointChanges || scoreboard.pendingPointChanges.length === 0) {
        throw new Error('Pending change not found');
      }

      const pendingChange = scoreboard.pendingPointChanges.find(
        (change) => change.id === pendingChangeId
      );

      if (!pendingChange) {
        throw new Error('Pending change not found');
      }

      // Update player score
      const updatedPlayers = scoreboard.players.map((player) =>
        player.id === pendingChange.playerId
          ? { ...player, score: player.score + pendingChange.points }
          : player
      );

      // Remove pending change
      const updatedPendingChanges = scoreboard.pendingPointChanges?.filter(
        (change) => change.id !== pendingChangeId
      );

      await this.scoreboardsCollection.doc(scoreboardId).update({
        players: updatedPlayers,
        pendingPointChanges: updatedPendingChanges || [],
      });
    } catch (error) {
      console.error('Error confirming pending point change:', error);
      throw error;
    }
  }

  async rejectPendingPointChange(scoreboardId: string, pendingChangeId: string): Promise<void> {
    try {
      const scoreboardDoc = await this.scoreboardsCollection.doc(scoreboardId).get();
      if (!scoreboardDoc.exists) {
        throw new Error('Scoreboard not found');
      }

      const scoreboard = scoreboardDoc.data() as Scoreboard;
      const updatedPendingChanges = scoreboard.pendingPointChanges?.filter(
        (change) => change.id !== pendingChangeId
      );

      await this.scoreboardsCollection.doc(scoreboardId).update({
        pendingPointChanges: updatedPendingChanges || [],
      });
    } catch (error) {
      console.error('Error rejecting pending point change:', error);
      throw error;
    }
  }

  // Real-time listeners
  subscribeToScoreboards(callback: (scoreboards: Scoreboard[]) => void): () => void {
    const unsubscribe = this.scoreboardsCollection
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        (snapshot) => {
          const scoreboards = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
            };
          }) as Scoreboard[];
          callback(scoreboards);
        },
        (error) => {
          console.error('Error in scoreboards subscription:', error);
        }
      );

    return unsubscribe;
  }

  subscribeToScoreboard(scoreboardId: string, callback: (scoreboard: Scoreboard | null) => void): () => void {
    const unsubscribe = this.scoreboardsCollection
      .doc(scoreboardId)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data();
            const scoreboard: Scoreboard = {
              id: doc.id,
              ...data,
              createdAt: data?.createdAt?.toDate() || new Date(),
            } as Scoreboard;
            callback(scoreboard);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.error('Error in scoreboard subscription:', error);
        }
      );

    return unsubscribe;
  }
}

export default new FirebaseService();