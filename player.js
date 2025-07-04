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

    // --- DOM Elements ---
    const loginSection = document.getElementById('login-section');
    const gameSection = document.getElementById('game-section');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    const waitingSection = document.getElementById('waiting-section');
    const roleRevealSection = document.getElementById('role-reveal-section');

    // --- LOGIN LOGIC ---
    let roomsListener = null; 
    let searchTimeout = null; 

    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.';
            return;
        }

        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang tìm game...';

        try {
            const apiResponse = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await apiResponse.json();
            if (!userData.success) {
                throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            }
            const username = userData.username;
            findAndJoinRoom(username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }
    };

    const findAndJoinRoom = (username) => {
        const roomsRef = database.ref('rooms');

        searchTimeout = setTimeout(() => {
            roomsRef.off('value', roomsListener); 
            loginError.textContent = 'Không tìm thấy game nào trong 30 giây. Quản trò đã tạo phòng chưa?';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }, 30000);

        roomsListener = (snapshot) => {
            if (!snapshot.exists()) return;

            const allRooms = snapshot.val();
            let foundRoom = false;

            for (const roomId in allRooms) {
                const room = allRooms[roomId];
                if (room.players) {
                    const playerId = Object.keys(room.players).find(key => room.players[key].name === username);
                    
                    if (playerId) {
                        foundRoom = true;
                        
                        clearTimeout(searchTimeout);
                        roomsRef.off('value', roomsListener);

                        // SỬA LỖI HIỂN THỊ TRANG TRẮNG
                        loginSection.classList.remove('active');
                        loginSection.classList.add('hidden');
                        
                        gameSection.classList.remove('hidden');
                        gameSection.classList.add('active');

                        initializeGame(username, roomId, playerId);
                        
                        break;
                    }
                }
            }
        };

        roomsRef.on('value', roomsListener);
    };

    // --- GAME LOGIC ---
    function initializeGame(playerName, roomId, playerId) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;

        const playerRef = database.ref(`rooms/${roomId}/players/${playerId}`);
        playerRef.update({ isOnline: true });
        playerRef.onDisconnect().update({ isOnline: false });

        const roleRef = database.ref(`rooms/${roomId}/players/${playerId}/role`);
        roleRef.on('value', (snapshot) => {
            const roleData = snapshot.val();
            if (roleData && typeof roleData === 'object' && roleData.name) {
                updateRoleUI(roleData);
            }
        });

        roleRevealSection.addEventListener('click', () => {
            roleRevealSection.classList.toggle('is-flipped');
        });
    }

    function updateRoleUI(role) {
        document.getElementById('role-name').textContent = role.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${role.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = role.description || 'Chưa có mô tả.';
        
        const roleImage = document.getElementById('role-image');
        const roleFactionEl = document.getElementById('role-faction');
        
        roleImage.src = role.image || 'assets/images/default-role.png';
        roleImage.alt = `Hình ảnh cho ${role.name}`;
        
        roleFactionEl.className = 'role-faction'; 
        if (role.faction === 'Sói') roleFactionEl.classList.add('wolf');
        else if (role.faction === 'Dân Làng') roleFactionEl.classList.add('villager');
        else roleFactionEl.classList.add('neutral');

        waitingSection.classList.add('hidden');
        roleRevealSection.classList.remove('hidden');
    }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loginBtn.click();
        }
    });
});