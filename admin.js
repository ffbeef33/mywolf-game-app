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

    // --- DOM Elements ---
    const roomIdDisplay = document.getElementById('room-id');
    const createRoomBtn = document.getElementById('create-room-btn');
    const setupSection = document.getElementById('setup-section');
    const gameManagementSection = document.getElementById('game-management-section');
    const votingSection = document.getElementById('voting-section');
    const playerList = document.getElementById('player-list');
    const playersJoinedDisplay = document.getElementById('players-joined');
    const playersTotalDisplay = document.getElementById('players-total');
    const startRolePickBtn = document.getElementById('start-role-pick-btn');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const startLynchVoteBtn = document.getElementById('start-lynch-vote-btn');
    const startExecuteVoteBtn = document.getElementById('start-execute-vote-btn');
    const endVoteBtn = document.getElementById('end-vote-btn');

    let currentRoomId = null;
    let totalPlayers = 0;
    let villagerRoles = [];
    let werewolfRoles = [];
    let players = {}; // Local state of players

    // --- Functions ---

    // 1. Create a new game room
    const createRoom = () => {
        const roomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        currentRoomId = roomId;
        roomIdDisplay.textContent = roomId;
        localStorage.setItem('roomId', roomId);

        totalPlayers = parseInt(document.getElementById('total-players').value);
        villagerRoles = document.getElementById('villager-roles').value.split(',').map(r => r.trim());
        werewolfRoles = document.getElementById('werewolf-roles').value.split(',').map(r => r.trim());

        // Set initial game state in Firebase
        database.ref(roomId).set({
            totalPlayers: totalPlayers,
            villagerRoles: villagerRoles,
            werewolfRoles: werewolfRoles,
            players: {},
            gameState: {
                status: 'waiting', // waiting, role-pick, voting, finished
                message: 'Chờ quản trò bắt đầu...'
            }
        });

        // Update UI
        setupSection.classList.add('hidden');
        gameManagementSection.classList.remove('hidden');
        votingSection.classList.remove('hidden');
        playersTotalDisplay.textContent = totalPlayers;

        // Listen for players joining
        listenForPlayers(roomId);
    };

    // 2. Listen for players joining the room
    const listenForPlayers = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        playersRef.on('value', (snapshot) => {
            const playersData = snapshot.val() || {};
            players = playersData; // Update local state
            updatePlayerList(playersData);
            
            const playerCount = Object.keys(playersData).length;
            playersJoinedDisplay.textContent = playerCount;

            // Enable start button when all players have joined
            if (playerCount === totalPlayers) {
                startRolePickBtn.disabled = false;
            } else {
                startRolePickBtn.disabled = true;
            }
        });
    };

    // 3. Update the player list in the UI
    const updatePlayerList = (playersData) => {
        playerList.innerHTML = '';
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const playerItem = document.createElement('li');
            playerItem.className = `player-item ${!player.isAlive ? 'dead' : ''}`;
            playerItem.innerHTML = `
                <span class="player-name">${player.name} ${player.role ? `(${player.role})` : ''}</span>
                <div class="player-actions">
                    <button class="btn-toggle-status" data-player-id="${playerId}">
                        ${player.isAlive ? 'Giết' : 'Hồi sinh'}
                    </button>
                    <button class="btn-kick" data-player-id="${playerId}">Kick</button>
                </div>
            `;
            playerList.appendChild(playerItem);
        }
    };
    
    // 4. Start the role picking phase
    const startRolePick = () => {
        database.ref(`${currentRoomId}/gameState`).update({
            status: 'role-pick',
            message: 'Hãy chọn vai trò bạn mong muốn hoặc chọn ngẫu nhiên.'
        });
        startRolePickBtn.disabled = true;
        sendRolesBtn.disabled = false;
        alert('Đã mở chức năng chọn vai trò cho người chơi.');
    };

    // 5. Logic to assign roles (complex part)
    const assignRoles = async () => {
        // This is a simplified version. A full implementation requires careful handling of choices.
        // For now, we will assign roles randomly.
        console.log("Bắt đầu phân vai...");
        const playersRef = database.ref(`${currentRoomId}/players`);
        const snapshot = await playersRef.once('value');
        const currentPlayers = snapshot.val() || {};
        
        let playerIds = Object.keys(currentPlayers);
        let allRoles = [...villagerRoles, ...werewolfRoles];

        // Shuffle players and roles
        playerIds.sort(() => Math.random() - 0.5);
        allRoles.sort(() => Math.random() - 0.5);

        const updates = {};
        playerIds.forEach((id, index) => {
            if (index < allRoles.length) {
                updates[`${id}/role`] = allRoles[index];
            }
        });

        await playersRef.update(updates);
        return updates;
    };
    
    // 6. Send roles to players
    const sendRoles = async () => {
        if (!confirm('Bạn có chắc muốn gửi vai trò cho tất cả người chơi? Hành động này không thể hoàn tác.')) return;

        await assignRoles(); // Perform role assignment
        
        database.ref(`${currentRoomId}/gameState`).update({
            status: 'roles-sent',
            message: 'Quản trò đã gửi vai trò. Hãy kiểm tra vai trò của bạn!'
        });
        
        sendRolesBtn.disabled = true;
        alert('Đã gửi vai trò thành công!');
        // TODO: Save roles to Google Sheet here
    };
    
    // 7. Manage player status (kick, alive/dead)
    const handlePlayerAction = (e) => {
        const target = e.target;
        const playerId = target.dataset.playerId;
        if (!playerId) return;

        if (target.classList.contains('btn-kick')) {
            if (confirm(`Bạn có chắc muốn kick người chơi ${players[playerId].name}?`)) {
                database.ref(`${currentRoomId}/players/${playerId}`).remove();
            }
        }

        if (target.classList.contains('btn-toggle-status')) {
            const currentStatus = players[playerId].isAlive;
            database.ref(`${currentRoomId}/players/${playerId}/isAlive`).set(!currentStatus);
        }
    };
    
    // 8. Start a vote
    const startVote = (voteType, targetPlayer = null) => {
        const voteTime = parseInt(document.getElementById('vote-time').value);
        const voteData = {
            status: 'voting',
            voteType: voteType, // 'lynch' or 'execute'
            target: targetPlayer, // Null for lynch, player name for execute
            endTime: Date.now() + voteTime * 1000,
            votes: {} // Reset votes
        };
        database.ref(`${currentRoomId}/gameState`).update(voteData);
        alert(`Đã bắt đầu bỏ phiếu ${voteType === 'lynch' ? 'lên giàn' : 'treo cổ'}.`);
    };

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', createRoom);
    playerList.addEventListener('click', handlePlayerAction);
    startRolePickBtn.addEventListener('click', startRolePick);
    sendRolesBtn.addEventListener('click', sendRoles);
    
    startLynchVoteBtn.addEventListener('click', () => startVote('lynch'));
    
    startExecuteVoteBtn.addEventListener('click', () => {
        const target = prompt("Nhập tên người chơi bị đưa lên giàn treo cổ:");
        if(target) {
            startVote('execute', target);
        }
    });

    endVoteBtn.addEventListener('click', () => {
        database.ref(`${currentRoomId}/gameState/status`).set('vote-ended');
        alert('Đã kết thúc bỏ phiếu.');
        // TODO: Display vote results
    });

});