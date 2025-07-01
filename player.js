document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyAYUuNxsYWI59ahvjKHZujKyTfi95DzNwU",
        authDomain: "mywolf-game.firebaseapp.com",
        databaseURL: "https://mywolf-game-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "mywolf-game",
        storageBucket: "mywolf-game.appspot.com",
        messagingSenderId: "1099375631706",
        appId: "1:1099375631706:web:a1f6ccbcf71b7176046763"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- DOM Elements for Login ---
    const loginSection = document.getElementById('login-section');
    const gameSection = document.getElementById('game-section');
    const passwordInput = document.getElementById('password-input');
    const roomIdInput = document.getElementById('room-id-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    // --- DOM Elements for Game ---
    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    const gameStatusDisplay = document.getElementById('game-status');
    const myRoleDisplay = document.getElementById('my-role');
    const rolePickSection = document.getElementById('role-pick-section');
    const roleChoicesContainer = document.getElementById('role-choices');
    const voteSection = document.getElementById('vote-section');
    const voteOptionsContainer = document.getElementById('vote-options');
    const voteTimerDisplay = document.getElementById('vote-timer');
    const playerListInfo = document.getElementById('player-list-info');

    let currentPlayerName = null;
    let currentRoomId = null;

    // --- LOGIN LOGIC ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        const roomId = roomIdInput.value.trim();

        if (!password || !roomId) {
            loginError.textContent = 'Vui lòng nhập đủ mật khẩu và ID phòng.';
            return;
        }

        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang vào...';

        try {
            // 1. Call API to get username from password
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Mật khẩu không hợp lệ.');
            }
            
            // 2. If successful, join the room with the retrieved username
            await joinRoom(roomId, data.username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Vào Game';
        }
    };

    const joinRoom = (roomId, username) => {
        return new Promise((resolve, reject) => {
            const roomRef = database.ref(roomId);
            roomRef.once('value', (snapshot) => {
                if (!snapshot.exists()) {
                    return reject(new Error('Phòng không tồn tại!'));
                }
                
                const players = snapshot.val().players || {};
                const playerEntry = Object.values(players).find(p => p.name === username);

                if (!playerEntry) {
                    return reject(new Error(`Bạn (${username}) không có trong danh sách chơi của phòng này.`));
                }

                // --- Login successful ---
                currentPlayerName = username;
                currentRoomId = roomId;

                // Switch UI
                loginSection.classList.add('hidden');
                gameSection.classList.remove('hidden');

                // Start game logic
                initializeGame(username, roomId);
                resolve();
            });
        });
    };

    // --- GAME LOGIC (functions from your original file) ---
    function initializeGame(playerName, roomId) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;

        const playerRef = database.ref(`${roomId}/players`).orderByChild('name').equalTo(playerName);
        playerRef.once('value', (snapshot) => {
            if (!snapshot.exists()) return;
            const playerId = Object.keys(snapshot.val())[0];
            const singlePlayerRef = database.ref(`${roomId}/players/${playerId}`);

            // Announce presence and set disconnect handler
            singlePlayerRef.update({ isOnline: true }); // Mark as online
            singlePlayerRef.onDisconnect().update({ isOnline: false });

            // Listen for my own role update
            const roleRef = database.ref(`${roomId}/players/${playerId}/role`);
            roleRef.on('value', (roleSnapshot) => {
                const role = roleSnapshot.val();
                if (role) {
                    myRoleDisplay.querySelector('strong').textContent = role;
                    myRoleDisplay.classList.remove('hidden');
                }
            });
        });

        // Listen for Game State Changes
        const gameStateRef = database.ref(`${roomId}/gameState`);
        gameStateRef.on('value', (snapshot) => {
            const state = snapshot.val();
            if (state) updateUIForState(state);
        });

        // Listen for Player List Changes
        const playersRef = database.ref(`${roomId}/players`);
        playersRef.on('value', (snapshot) => {
            const players = snapshot.val() || {};
            updatePlayerList(players);
        });
    }

    let voteTimerInterval;
    function updateUIForState(state) {
        gameStatusDisplay.textContent = state.message || '...';
        rolePickSection.classList.add('hidden');
        voteSection.classList.add('hidden');
        voteTimerDisplay.classList.add('hidden');
        clearInterval(voteTimerInterval);

        switch (state.status) {
            case 'role-pick':
                rolePickSection.classList.remove('hidden');
                loadRoleChoices();
                break;
            case 'voting':
                voteSection.classList.remove('hidden');
                voteTimerDisplay.classList.remove('hidden');
                loadVoteOptions(state);
                startTimer(state.endTime);
                break;
        }
    }

    function updatePlayerList(players) {
        playerListInfo.innerHTML = '';
        Object.values(players).forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            if (!player.isAlive) li.classList.add('dead');
            playerListInfo.appendChild(li);
        });
    }

    // Other game functions remain mostly the same
    async function loadRoleChoices() { /* ... your existing code ... */ }
    function selectRole(role) { /* ... your existing code ... */ }
    async function loadVoteOptions(state) { /* ... your existing code ... */ }
    function castVote(vote) { /* ... your existing code ... */ }
    function startTimer(endTime) { /* ... your existing code ... */ }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    document.getElementById('random-role-btn').onclick = () => selectRole('random');
});