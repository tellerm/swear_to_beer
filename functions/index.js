const {onDocumentCreated, onDocumentUpdated} =
  require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

// Send notification when a new scoreboard is created
exports.onScoreboardCreated = onDocumentCreated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const scoreboard = event.data.data();
      const creatorId = scoreboard.createdBy;

      try {
      // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Find the competitor (not the creator)
        const competitor = scoreboard.players.find((player) => {
          const user = Object.values(users).find(
              (u) => u.name === player.name && u.id !== creatorId,
          );
          return user;
        });

        if (!competitor) {
          console.log("No competitor found");
          return null;
        }

        // Get competitor's user data
        const competitorUser = Object.values(users).find(
            (u) => u.name === competitor.name &&
          u.id !== creatorId,
        );

        if (!competitorUser || !competitorUser.fcmToken) {
          console.log("Competitor has no FCM token");
          return null;
        }

        // Get creator's name
        const creator = users[creatorId];
        const creatorName = creator ? creator.name : "Someone";

        // Send data-only notification (so app can display with action buttons)
        const message = {
          data: {
            type: "new_scoreboard",
            scoreboardId: event.params.scoreboardId,
            scoreboardName: scoreboard.name,
            creatorName: creatorName,
            title: "🎯 New Scoreboard Challenge!",
            body: `${creatorName} challenged you to "${scoreboard.name}"`,
          },
          token: competitorUser.fcmToken,
        };

        await admin.messaging().send(message);
        console.log("Notification sent successfully");
        return null;
      } catch (error) {
        console.error("Error sending notification:", error);
        return null;
      }
    },
);

// Send notification when scoreboard is accepted
exports.onScoreboardAccepted = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if status changed to active
      if (beforeData.status !== "active" && afterData.status === "active") {
        const creatorId = afterData.createdBy;

        try {
          // Get creator's user data
          const creatorDoc = await admin
              .firestore()
              .collection("users")
              .doc(creatorId)
              .get();

          if (!creatorDoc.exists) {
            console.log("Creator not found");
            return null;
          }

          const creator = creatorDoc.data();

          if (!creator.fcmToken) {
            console.log("Creator has no FCM token");
            return null;
          }

          // Find who accepted (the other player)
          const acceptorPlayer = afterData.players.find(
              (player) => player.name !== creator.name,
          );
          const acceptorName = acceptorPlayer ?
            acceptorPlayer.name : "Someone";

          // Send notification
          const message = {
            notification: {
              title: "✅ Challenge Accepted!",
              body: `${acceptorName} accepted your challenge ` +
                `"${afterData.name}"`,
            },
            data: {
              type: "scoreboard_accepted",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
            },
            token: creator.fcmToken,
          };

          await admin.messaging().send(message);
          console.log("Acceptance notification sent successfully");
          return null;
        } catch (error) {
          console.error("Error sending acceptance notification:", error);
          return null;
        }
      }

      return null;
    },
);

// Send notification when scoreboard is rejected
exports.onScoreboardRejected = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if status changed to rejected
      if (beforeData.status !== "rejected" && afterData.status === "rejected") {
        const creatorId = afterData.createdBy;

        try {
          // Get creator's user data
          const creatorDoc = await admin
              .firestore()
              .collection("users")
              .doc(creatorId)
              .get();

          if (!creatorDoc.exists) {
            console.log("Creator not found");
            return null;
          }

          const creator = creatorDoc.data();

          if (!creator.fcmToken) {
            console.log("Creator has no FCM token");
            return null;
          }

          // Find who rejected (the other player)
          const rejectorPlayer = afterData.players.find(
              (player) => player.name !== creator.name,
          );
          const rejectorName = rejectorPlayer ?
            rejectorPlayer.name : "Someone";

          // Send notification
          const message = {
            notification: {
              title: "❌ Challenge Rejected",
              body: `${rejectorName} rejected your challenge ` +
                `"${afterData.name}"`,
            },
            data: {
              type: "scoreboard_rejected",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
            },
            token: creator.fcmToken,
          };

          await admin.messaging().send(message);
          console.log("Rejection notification sent successfully");
          return null;
        } catch (error) {
          console.error("Error sending rejection notification:", error);
          return null;
        }
      }

      return null;
    },
);

// Send notification when pending point change is added
exports.onPendingPointAdded = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if a new pending point change was added
      const beforePending = beforeData.pendingPointChanges || [];
      const afterPending = afterData.pendingPointChanges || [];

      if (afterPending.length <= beforePending.length) {
        return null;
      }

      // Find the new pending change
      const newChange = afterPending.find(
          (change) => !beforePending.some((bc) => bc.id === change.id),
      );

      if (!newChange) {
        return null;
      }

      try {
        // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Send notifications to all players except the one who added the change
        const notifications = afterData.players.map(async (player) => {
          const user = Object.values(users).find(
              (u) => u.name === player.name && u.id !== newChange.addedBy,
          );

          if (!user || !user.fcmToken) {
            console.log(`Player ${player.name} has no FCM token`);
            return null;
          }

          const message = {
            data: {
              type: "pending_point_added",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
              changeId: newChange.id,
              title: "⏳ Point Change Pending",
              body: `${newChange.addedByName} wants to add ` +
                `${newChange.points} point(s) to ${newChange.playerName}`,
            },
            token: user.fcmToken,
          };

          await admin.messaging().send(message);
          console.log(`Pending point notification sent to ${player.name}`);
        });

        await Promise.all(notifications);
        return null;
      } catch (error) {
        console.error("Error sending pending point notification:", error);
        return null;
      }
    },
);

// Send notification when someone leaves a scoreboard
exports.onPlayerLeftScoreboard = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Only process active scoreboards
      if (afterData.status !== "active") {
        return null;
      }

      // Check if a player left (players array got smaller)
      if (beforeData.players.length <= afterData.players.length) {
        return null;
      }

      try {
        // Find who left
        const leftPlayers = beforeData.players.filter(
            (beforePlayer) => !afterData.players.some(
                (afterPlayer) => afterPlayer.name === beforePlayer.name,
            ),
        );

        if (leftPlayers.length === 0) {
          return null;
        }

        const leftPlayerName = leftPlayers[0].name;

        // Get all users to find FCM tokens
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Send notification to remaining players
        const notifications = afterData.players.map(async (player) => {
          const user = Object.values(users).find(
              (u) => u.name === player.name,
          );

          if (!user || !user.fcmToken) {
            console.log(`Player ${player.name} has no FCM token`);
            return null;
          }

          const message = {
            notification: {
              title: "👋 Player Left",
              body: `${leftPlayerName} left "${afterData.name}"`,
            },
            data: {
              type: "player_left",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
              playerName: leftPlayerName,
            },
            token: user.fcmToken,
          };

          await admin.messaging().send(message);
          console.log(`Left notification sent to ${player.name}`);
        });

        await Promise.all(notifications);
        return null;
      } catch (error) {
        console.error("Error sending player left notification:", error);
        return null;
      }
    },
);

// Send notification when pending beer repayment is added
exports.onPendingBeerRepaymentAdded = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if a new pending beer repayment was added
      const beforePending = beforeData.pendingBeerRepayments || [];
      const afterPending = afterData.pendingBeerRepayments || [];

      if (afterPending.length <= beforePending.length) {
        return null;
      }

      // Find the new pending repayment
      const newRepayment = afterPending.find(
          (repayment) => !beforePending.some((br) => br.id === repayment.id),
      );

      if (!newRepayment) {
        return null;
      }

      try {
        // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Send notifications to all players except requester
        const notifications = afterData.players.map(async (player) => {
          const user = Object.values(users).find(
              (u) => u.name === player.name &&
                u.id !== newRepayment.requestedBy,
          );

          if (!user || !user.fcmToken) {
            console.log(`Player ${player.name} has no FCM token`);
            return null;
          }

          const message = {
            data: {
              type: "pending_beer_repayment",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
              repaymentId: newRepayment.id,
              title: "🍺 Beer Repayment Request",
              body: `${newRepayment.requestedByName} wants to repay ` +
                `${newRepayment.beers} beer(s) for ${newRepayment.playerName}`,
            },
            token: user.fcmToken,
          };

          await admin.messaging().send(message);
          console.log(`Beer repayment notification sent to ${player.name}`);
        });

        await Promise.all(notifications);
        return null;
      } catch (error) {
        console.error("Error sending beer repayment notification:", error);
        return null;
      }
    },
);

// Send notification when point addition is rejected
exports.onPointRejected = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      const beforePending = beforeData.pendingPointChanges || [];
      const afterPending = afterData.pendingPointChanges || [];

      // Check if a pending change was removed
      if (afterPending.length >= beforePending.length) {
        return null;
      }

      // Find the removed pending change
      const removedChanges = beforePending.filter(
          (beforeChange) => !afterPending.some(
              (afterChange) => afterChange.id === beforeChange.id,
          ),
      );

      if (removedChanges.length === 0) {
        return null;
      }

      const removedChange = removedChanges[0];

      // Check if the player's score changed
      const beforePlayer = beforeData.players.find(
          (p) => p.id === removedChange.playerId,
      );
      const afterPlayer = afterData.players.find(
          (p) => p.id === removedChange.playerId,
      );

      // If score changed, it was confirmed, not rejected
      if (beforePlayer && afterPlayer &&
          beforePlayer.score !== afterPlayer.score) {
        return null;
      }

      // Score didn't change, so it was rejected
      try {
        // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Find the user who added the point
        const requester = Object.values(users).find(
            (u) => u.id === removedChange.addedBy,
        );

        if (!requester || !requester.fcmToken) {
          console.log("Requester has no FCM token");
          return null;
        }

        const message = {
          notification: {
            title: "❌ Point Request Rejected",
            body: `Your request to add ${removedChange.points} ` +
              `point(s) to ${removedChange.playerName} was rejected`,
          },
          data: {
            type: "point_rejected",
            scoreboardId: event.params.scoreboardId,
            scoreboardName: afterData.name,
          },
          token: requester.fcmToken,
        };

        await admin.messaging().send(message);
        console.log(`Point rejection notification sent`);
        return null;
      } catch (error) {
        console.error("Error sending point rejection notification:", error);
        return null;
      }
    },
);

// Send notification when beer repayment is rejected
exports.onBeerRepaymentRejected = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      const beforePending = beforeData.pendingBeerRepayments || [];
      const afterPending = afterData.pendingBeerRepayments || [];

      // Check if a pending repayment was removed
      if (afterPending.length >= beforePending.length) {
        return null;
      }

      // Find the removed repayment
      const removedRepayments = beforePending.filter(
          (beforeRepayment) => !afterPending.some(
              (afterRepayment) => afterRepayment.id === beforeRepayment.id,
          ),
      );

      if (removedRepayments.length === 0) {
        return null;
      }

      const removedRepayment = removedRepayments[0];

      // Check if the player's score changed
      const beforePlayer = beforeData.players.find(
          (p) => p.id === removedRepayment.playerId,
      );
      const afterPlayer = afterData.players.find(
          (p) => p.id === removedRepayment.playerId,
      );

      // If score changed, it was confirmed, not rejected
      if (beforePlayer && afterPlayer &&
          beforePlayer.score !== afterPlayer.score) {
        return null;
      }

      // Score didn't change, so it was rejected
      try {
        // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Find the user who requested repayment
        const requester = Object.values(users).find(
            (u) => u.id === removedRepayment.requestedBy,
        );

        if (!requester || !requester.fcmToken) {
          console.log("Requester has no FCM token");
          return null;
        }

        const message = {
          notification: {
            title: "❌ Repayment Request Rejected",
            body: `Your request to repay ${removedRepayment.beers} ` +
              `beer(s) for ${removedRepayment.playerName} was rejected`,
          },
          data: {
            type: "repayment_rejected",
            scoreboardId: event.params.scoreboardId,
            scoreboardName: afterData.name,
          },
          token: requester.fcmToken,
        };

        await admin.messaging().send(message);
        console.log(`Repayment rejection notification sent`);
        return null;
      } catch (error) {
        console.error("Error sending repayment rejection notification:", error);
        return null;
      }
    },
);

// Send notification when reset request is rejected
exports.onResetRejected = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if reset was rejected (had pendingReset, now gone, scores same)
      const hadPendingReset = beforeData.pendingReset !== undefined;
      const noPendingResetNow = afterData.pendingReset === undefined;

      if (!hadPendingReset || !noPendingResetNow) {
        return null;
      }

      // Check if scores were reset (if yes, it was confirmed, not rejected)
      const allScoresZero = afterData.players.every(
          (p) => p.score === 0 &&
            (p.totalScore === undefined || p.totalScore === 0),
      );

      // If scores were reset, it was confirmed
      if (allScoresZero) {
        return null;
      }

      // Reset was rejected
      try {
        // Get all users
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Find the user who requested reset
        const requester = Object.values(users).find(
            (u) => u.id === beforeData.pendingReset.requestedBy,
        );

        if (!requester || !requester.fcmToken) {
          console.log("Requester has no FCM token");
          return null;
        }

        const message = {
          notification: {
            title: "❌ Reset Request Rejected",
            body: `Your request to reset "${afterData.name}" was rejected`,
          },
          data: {
            type: "reset_rejected",
            scoreboardId: event.params.scoreboardId,
            scoreboardName: afterData.name,
          },
          token: requester.fcmToken,
        };

        await admin.messaging().send(message);
        console.log(`Reset rejection notification sent`);
        return null;
      } catch (error) {
        console.error("Error sending reset rejection notification:", error);
        return null;
      }
    },
);

// Send notification when pending reset is requested
exports.onPendingResetAdded = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Check if a pending reset was added
      if (!beforeData.pendingReset && afterData.pendingReset) {
        const pendingReset = afterData.pendingReset;

        try {
          // Get all users
          const usersSnapshot = await admin
              .firestore()
              .collection("users")
              .get();
          const users = {};
          usersSnapshot.forEach((doc) => {
            users[doc.id] = doc.data();
          });

          // Send notifications to all players except requester
          const notifications = afterData.players.map(async (player) => {
            const user = Object.values(users).find(
                (u) => u.name === player.name &&
                  u.id !== pendingReset.requestedBy,
            );

            if (!user || !user.fcmToken) {
              console.log(`Player ${player.name} has no FCM token`);
              return null;
            }

            const message = {
              data: {
                type: "pending_reset",
                scoreboardId: event.params.scoreboardId,
                scoreboardName: afterData.name,
                title: "🔄 Reset Request",
                body: `${pendingReset.requestedByName} wants to ` +
                  `reset "${afterData.name}" to 0:0`,
              },
              token: user.fcmToken,
            };

            await admin.messaging().send(message);
            console.log(`Reset request notification sent to ${player.name}`);
          });

          await Promise.all(notifications);
          return null;
        } catch (error) {
          console.error("Error sending reset request notification:", error);
          return null;
        }
      }

      return null;
    },
);

// Send notification when scoreboard reset is confirmed
exports.onScoreboardReset = onDocumentUpdated(
    {
      document: "scoreboards/{scoreboardId}",
      region: "europe-west3",
    },
    async (event) => {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Only process active scoreboards
      if (afterData.status !== "active") {
        return null;
      }

      // Check if reset was confirmed (pendingReset removed and scores reset)
      const hadPendingReset = beforeData.pendingReset !== undefined;
      const noPendingResetNow = afterData.pendingReset === undefined;
      const allScoresZero = afterData.players.every(
          (p) => p.score === 0 &&
            (p.totalScore === undefined || p.totalScore === 0),
      );

      // Only notify if this was a confirmed reset
      if (!hadPendingReset || !noPendingResetNow || !allScoresZero) {
        return null;
      }

      try {
        // Get all users to find FCM tokens
        const usersSnapshot = await admin
            .firestore()
            .collection("users")
            .get();
        const users = {};
        usersSnapshot.forEach((doc) => {
          users[doc.id] = doc.data();
        });

        // Send notification to all players
        const notifications = afterData.players.map(async (player) => {
          const user = Object.values(users).find(
              (u) => u.name === player.name,
          );

          if (!user || !user.fcmToken) {
            console.log(`Player ${player.name} has no FCM token`);
            return null;
          }

          const message = {
            notification: {
              title: "🔄 Scoreboard Reset",
              body: `All scores in "${afterData.name}" have been reset to 0`,
            },
            data: {
              type: "scoreboard_reset",
              scoreboardId: event.params.scoreboardId,
              scoreboardName: afterData.name,
            },
            token: user.fcmToken,
          };

          await admin.messaging().send(message);
          console.log(`Reset notification sent to ${player.name}`);
        });

        await Promise.all(notifications);
        return null;
      } catch (error) {
        console.error("Error sending reset notification:", error);
        return null;
      }
    },
);
