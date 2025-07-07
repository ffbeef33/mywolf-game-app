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
    const waitingSection = document.getElementById('waiting-section');
    const waitingTitle = waitingSection.querySelector('h2');
    const waitingMessage = waitingSection.querySelector('p');
    const playerPickSection = document.getElementById('player-pick-section');
    const roleRevealSection = document.getElementById('role-reveal-section');
    const pickTimerDisplay = document.getElementById('pick-timer-display');
    const roleChoicesContainer = document.getElementById('role-choices-container');
    const randomChoiceBtn = document.getElementById('random-choice-btn');
    const choiceStatus = document.getElementById('choice-status');
    const rolesInGameDisplay = document.getElementById('roles-in-game-display'); // Khu vực mới
    const rolesInGameList = document.getElementById('roles-in-game-list'); // List mới

    let roomListener = null;
    let pickTimerInterval = null;
    let searchInterval = null;
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
            startPeriodicRoomSearch(userData.username);

        } catch (error) {
            goBackToLogin(error.message);
        }
    };

    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            startPeriodicRoomSearch(username);
        } else {
            loginSection.classList.remove('hidden');
            gameSection.classList.add('hidden');
        }
    };

    // --- CORE GAME LOGIC & UI ---

    const cleanup = () => {
        if (roomListener && currentRoomId) {
            database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        }
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (searchInterval) clearInterval(searchInterval);
        
        roomListener = null;
        pickTimerInterval = null;
        searchInterval = null;
        currentRoomId = null;
    };

    const goBackToLogin = (message) => {
        cleanup();
        gameSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        loginError.textContent = message;
        passwordInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Tìm và Vào Game';
    };

    const startPeriodicRoomSearch = (username) => {
        cleanup();
        
        loginSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        playerNameDisplay.textContent = username;
        showSection(waitingSection);
        waitingTitle.textContent = "Đang Tìm Phòng...";
        waitingMessage.textContent = "Hệ thống đang tìm kiếm phòng chơi của bạn.";
        rolesInGameDisplay.classList.add('hidden'); // Ẩn danh sách vai trò khi đang tìm

        const scanForRoom = async () => {
            try {
                const roomsRef = database.ref('rooms');
                const snapshot = await roomsRef.get();
                const allRooms = snapshot.val();
                let foundRoomId = null;

                if (allRooms) {
                    for (const roomId in allRooms) {
                        const room = allRooms[roomId];
                        if (room.players && Object.values(room.players).some(p => p.name === username)) {
                            foundRoomId = roomId;
                            break;
                        }
                    }
                }

                if (foundRoomId) {
                    clearInterval(searchInterval);
                    searchInterval = null;
                    attachListenerToSpecificRoom(username, foundRoomId);
                } else {
                    waitingTitle.textContent = "Chưa Có Phòng";
                    waitingMessage.textContent = "Đang chờ Quản Trò tạo phòng chơi...";
                }
            } catch (error) {
                console.error("Lỗi khi quét phòng:", error);
                waitingMessage.textContent = "Lỗi kết nối, đang thử lại...";
            }
        };

        scanForRoom();
        searchInterval = setInterval(scanForRoom, 5000);
    };

    function attachListenerToSpecificRoom(username, roomId) {
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);

        roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (roomData) {
                updateGameState(username, roomId, roomData);
            } else {
                startPeriodicRoomSearch(username);
            }
        }, (error) => {
            console.error("Firebase listener error:", error);
            goBackToLogin('Mất kết nối với phòng chơi.');
        });
    }

    function updateGameState(username, roomId, roomData) {
        roomIdDisplay.textContent = roomId;
        const myPlayer = Object.values(roomData.players).find(p => p.name === username);

        if (!myPlayer) {
            startPeriodicRoomSearch(username);
            return;
        }

        if (myPlayer.role) {
            showSection(roleRevealSection);
            updateRoleCard(myPlayer.role);
        } else if (roomData.playerPickState && roomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, roomData.playerPickState);
        } else {
            showSection(waitingSection);
            waitingTitle.textContent = "Đang chờ Quản Trò...";
            waitingMessage.textContent = "Vai trò của bạn sẽ sớm được tiết lộ.";
            // *** HIỂN THỊ DANH SÁCH VAI TRÒ ***
            displayRolesInGame(roomData.rolesToAssign || []);
        }
    }
    
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection].forEach(section => {
            section.classList.toggle('hidden', section !== sectionToShow);
        });
        // Ẩn danh sách vai trò nếu không ở màn hình chờ
        if (sectionToShow !== waitingSection) {
            rolesInGameDisplay.classList.add('hidden');
        }
    }
    
    // *** HÀM MỚI: TẠO VÀ HIỂN THỊ DANH SÁCH VAI TRÒ ***
    function displayRolesInGame(roles) {
        rolesInGameList.innerHTML = ''; // Xóa danh sách cũ
        if (roles.length > 0) {
            // Xáo trộn danh sách để không tiết lộ thứ tự
            const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);
            shuffledRoles.forEach(roleName => {
                const roleCard = document.createElement('div');
                roleCard.className = 'in-game-role-card';
                roleCard.textContent = roleName;
                rolesInGameList.appendChild(roleCard);
            });
            rolesInGameDisplay.classList.remove('hidden');
        } else {
            rolesInGameDisplay.classList.add('hidden');
        }
    }

    function handlePlayerPickState(username, roomId, state) {
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        
        const updateTimer = () => {
            const remaining = Math.round((state.endTime - Date.now()) / 1000);
            pickTimerDisplay.textContent = remaining > 0 ? `${remaining}s` : "Hết giờ!";
            if (remaining <= 0) clearInterval(pickTimerInterval);
        };
        updateTimer();
        pickTimerInterval = setInterval(updateTimer, 1000);

        const myChoice = state.playerChoices[username];
        const hasChosen = myChoice && myChoice !== 'waiting';

        roleChoicesContainer.innerHTML = '';
        if (!hasChosen) {
            state.availableRoles.forEach(roleName => {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = roleName;
                btn.addEventListener('click', () => selectRole(username, roomId, roleName));
                roleChoicesContainer.appendChild(btn);
            });
            randomChoiceBtn.disabled = false;
            choiceStatus.textContent = 'Hãy đưa ra lựa chọn của bạn...';
        } else {
            roleChoicesContainer.innerHTML = `<p>Lựa chọn của bạn:</p><h3>${myChoice === 'random' ? 'Nhận Ngẫu Nhiên' : myChoice}</h3>`;
            randomChoiceBtn.disabled = true;
            choiceStatus.textContent = 'Đang chờ những người chơi khác...';
        }
    }

    function selectRole(username, roomId, choice) {
        database.ref(`rooms/${roomId}/playerPickState/playerChoices/${username}`).set(choice)
            .catch(err => console.error("Lỗi khi gửi lựa chọn:", err));
    }
    
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
            if (username) selectRole(username, currentRoomId, 'random');
        }
    });

    // --- INITIAL LOAD ---
    checkSessionAndAutoLogin();
});