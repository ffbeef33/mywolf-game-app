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

    // --- DOM Elements (đã cập nhật) ---
    const loginSection = document.getElementById('login-section');
    const gameSection = document.getElementById('game-section');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    
    // Các khu vực trong game
    const gameView = document.getElementById('game-view');
    const waitingSection = document.getElementById('waiting-section');
    const playerPickSection = document.getElementById('player-pick-section');
    const roleRevealSection = document.getElementById('role-reveal-section');
    
    // Các thành phần của Player Pick
    const pickTimerDisplay = document.getElementById('pick-timer-display');
    const roleChoicesContainer = document.getElementById('role-choices-container');
    const randomChoiceBtn = document.getElementById('random-choice-btn');
    const choiceStatus = document.getElementById('choice-status');

    let roomListener = null;
    let pickTimerInterval = null;
    let currentRoomId = null;

    // --- LOGIN & SESSION ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.';
            return;
        }
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xác thực...';
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            sessionStorage.setItem('mywolf_username', userData.username);
            listenForMyRoom(userData.username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }
    };

    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            listenForMyRoom(username);
        } else {
            loginSection.classList.remove('hidden');
        }
    };

    // --- CORE GAME LOGIC ---
    function listenForMyRoom(username) {
        loginSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        playerNameDisplay.textContent = username;

        const roomsRef = database.ref('rooms');
        if (roomListener) roomsRef.off('value', roomListener);

        roomListener = roomsRef.on('value', (snapshot) => {
            const allRooms = snapshot.val();
            let playerRoom = null;
            let foundRoomId = null;

            if (allRooms) {
                for (const roomId in allRooms) {
                    const room = allRooms[roomId];
                    if (room.players && Object.values(room.players).some(p => p.name === username)) {
                        playerRoom = room;
                        foundRoomId = roomId;
                        currentRoomId = roomId;
                        break;
                    }
                }
            }

            if (playerRoom) {
                updateGameState(username, foundRoomId, playerRoom);
            } else {
                // Bị kick hoặc phòng bị xóa
                gameSection.classList.add('hidden');
                loginSection.classList.remove('hidden');
                loginError.textContent = 'Không tìm thấy phòng của bạn. Vui lòng thử lại.';
                if (roomListener) roomListener.off();
                if (pickTimerInterval) clearInterval(pickTimerInterval);
            }
        });
    }

    function updateGameState(username, roomId, roomData) {
        roomIdDisplay.textContent = roomId;
        const myPlayer = Object.values(roomData.players).find(p => p.name === username);

        // Ưu tiên 1: Nếu đã có vai trò cuối cùng -> Hiển thị thẻ bài
        if (myPlayer && myPlayer.role) {
            showSection(roleRevealSection);
            updateRoleCard(myPlayer.role);
            return;
        }

        // Ưu tiên 2: Nếu đang trong giai đoạn Player Pick -> Hiển thị giao diện chọn
        if (roomData.playerPickState && roomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, roomData.playerPickState);
            return;
        }
        
        // Mặc định: Hiển thị màn hình chờ
        showSection(waitingSection);
    }
    
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection].forEach(section => {
            if (section === sectionToShow) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
    }

    // --- PLAYER PICK FEATURE ---
    function handlePlayerPickState(username, roomId, state) {
        // Cập nhật đồng hồ đếm ngược
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        pickTimerInterval = setInterval(() => {
            const remaining = Math.round((state.endTime - Date.now()) / 1000);
            if (remaining >= 0) {
                pickTimerDisplay.textContent = `${remaining}s`;
            } else {
                pickTimerDisplay.textContent = "Hết giờ!";
                clearInterval(pickTimerInterval);
            }
        }, 1000);

        const myChoice = state.playerChoices[username];
        const hasChosen = myChoice && myChoice !== 'waiting';

        // Hiển thị các nút lựa chọn
        roleChoicesContainer.innerHTML = '';
        if (!hasChosen) {
            state.availableRoles.forEach(roleName => {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = roleName;
                btn.dataset.role = roleName;
                btn.addEventListener('click', () => selectRole(username, roomId, roleName));
                roleChoicesContainer.appendChild(btn);
            });
            randomChoiceBtn.disabled = false;
            choiceStatus.textContent = '';
        } else {
            // Nếu đã chọn, vô hiệu hóa các nút và hiển thị lựa chọn
            roleChoicesContainer.innerHTML = `<p>Lựa chọn của bạn:</p><h3>${myChoice === 'random' ? 'Nhận Ngẫu Nhiên' : myChoice}</h3>`;
            randomChoiceBtn.disabled = true;
            choiceStatus.textContent = 'Đang chờ những người chơi khác...';
        }
    }

    function selectRole(username, roomId, choice) {
        const choiceRef = database.ref(`rooms/${roomId}/playerPickState/playerChoices/${username}`);
        choiceRef.set(choice)
            .then(() => console.log(`Player ${username} chose ${choice}`))
            .catch(err => console.error("Lỗi khi gửi lựa chọn:", err));
    }
    
    // --- ROLE REVEAL FEATURE ---
    function updateRoleCard(role) {
        document.getElementById('role-name').textContent = role.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${role.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = role.description || 'Chưa có mô tả.';
        const roleImage = document.getElementById('role-image');
        const roleFactionEl = document.getElementById('role-faction');
        roleImage.src = role.image || 'assets/images/default-role.png';
        roleImage.alt = `Hình ảnh cho ${role.name}`;
        roleFactionEl.className = 'role-faction';
        if (role.faction === 'Phe Sói') roleFactionEl.classList.add('wolf');
        else if (role.faction === 'Phe Dân') roleFactionEl.classList.add('villager');
        else roleFactionEl.classList.add('neutral');
    }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') loginBtn.click();
    });
    roleRevealSection.addEventListener('click', () => {
        roleRevealSection.classList.toggle('is-flipped');
    });
    randomChoiceBtn.addEventListener('click', () => {
        if (currentRoomId) {
            const username = sessionStorage.getItem('mywolf_username');
            selectRole(username, currentRoomId, 'random');
        }
    });

    // --- INITIAL LOAD ---
    checkSessionAndAutoLogin();
});