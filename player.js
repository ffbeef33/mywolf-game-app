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

    // --- Initialize Firebase ---
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- Get Player Info from localStorage ---
    const playerName = localStorage.getItem('playerName');
    const roomId = localStorage.getItem('roomId');

    if (!playerName || !roomId) {
        alert('Không tìm thấy thông tin phòng. Vui lòng đăng nhập lại.');
        window.location.href = 'index.html';
        return;
    }

    // --- DOM Elements ---
    const playerNameDisplay = document.getElementById('player-name');
    const roomIdDisplay = document.getElementById('room-id-display');
    const gameStatusDisplay = document.getElementById('game-status');
    const myRoleDisplay = document.getElementById('my-role');
    const rolePickSection = document.getElementById('role-pick-section');
    const roleChoicesContainer = document.getElementById('role-choices');
    const voteSection = document.getElementById('vote-section');
    const voteOptionsContainer = document.getElementById('vote-options');
    const voteTimerDisplay = document.getElementById('vote-timer');
    const playerListInfo = document.getElementById('player-list-info');

    playerNameDisplay.textContent = playerName;
    roomIdDisplay.textContent = roomId;

    const playerRef = database.ref(`${roomId}/players/${playerName}`);
    
    // --- Announce presence and set disconnect handler ---
    playerRef.set({
        name: playerName,
        isAlive: true,
        role: '',
        choice: '' // For role picking
    });

    playerRef.onDisconnect().remove();

    // --- Listen for Game State Changes ---
    const gameStateRef = database.ref(`${roomId}/gameState`);
    gameStateRef.on('value', (snapshot) => {
        const state = snapshot.val();
        if (!state) return;

        gameStatusDisplay.textContent = state.message;
        updateUIForState(state);
    });

    // --- Listen for Player List Changes ---
    const playersRef = database.ref(`${roomId}/players`);
    playersRef.on('value', (snapshot) => {
        const players = snapshot.val() || {};
        updatePlayerList(players);
        
        // Check for my own role update
        if (players[playerName] && players[playerName].role) {
            myRoleDisplay.querySelector('strong').textContent = players[playerName].role;
            myRoleDisplay.classList.remove('hidden');
        }
    });

    // --- UI Update Functions ---
    let voteTimerInterval;
    function updateUIForState(state) {
        // Hide all sections first
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
        for (const id in players) {
            const player = players[id];
            const li = document.createElement('li');
            li.textContent = player.name;
            if (!player.isAlive) {
                li.classList.add('dead');
            }
            playerListInfo.appendChild(li);
        }
    }

    async function loadRoleChoices() {
        const villagerRolesSnapshot = await database.ref(`${roomId}/villagerRoles`).once('value');
        const roles = villagerRolesSnapshot.val() || [];
        roleChoicesContainer.innerHTML = '';
        roles.forEach(role => {
            const button = document.createElement('button');
            button.textContent = role;
            button.onclick = () => selectRole(role);
            roleChoicesContainer.appendChild(button);
        });
    }
    
    function selectRole(role) {
        playerRef.update({ choice: role });
        rolePickSection.innerHTML = '<h2>Cảm ơn, bạn đã chọn. Vui lòng chờ quản trò...</h2>';
    }
    document.getElementById('random-role-btn').onclick = () => selectRole('random');

    async function loadVoteOptions(state) {
        const playersSnapshot = await database.ref(`${roomId}/players`).once('value');
        const players = playersSnapshot.val();
        voteOptionsContainer.innerHTML = '';

        document.getElementById('vote-title').textContent = state.voteType === 'lynch' 
            ? 'Bỏ Phiếu Lên Giàn' 
            : `Bỏ Phiếu Treo Cổ: ${state.target}`;

        for (const id in players) {
            if (players[id].isAlive) {
                const button = document.createElement('button');
                button.textContent = players[id].name;
                button.onclick = () => castVote(players[id].name);
                voteOptionsContainer.appendChild(button);
            }
        }
        const skipButton = document.createElement('button');
        skipButton.textContent = 'Bỏ qua';
        skipButton.style.backgroundColor = '#777';
        skipButton.onclick = () => castVote('skip');
        voteOptionsContainer.appendChild(skipButton);
    }

    function castVote(vote) {
        database.ref(`${roomId}/gameState/votes/${playerName}`).set(vote);
        voteSection.innerHTML = '<h2>Bạn đã bỏ phiếu. Vui lòng chờ...</h2>';
    }

    function startTimer(endTime) {
        voteTimerInterval = setInterval(() => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining >= 0) {
                voteTimerDisplay.textContent = `Thời gian còn lại: ${remaining}s`;
            } else {
                voteTimerDisplay.textContent = "Hết giờ!";
                clearInterval(voteTimerInterval);
            }
        }, 1000);
    }
});