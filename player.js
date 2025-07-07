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
    const playerPickSection = document.getElementById('player-pick-section');
    const roleRevealSection = document.getElementById('role-reveal-section');
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
        loginBtn.textContent = 'Đang tìm phòng...';
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            sessionStorage.setItem('mywolf_username', userData.username);
            await findAndListenToMyRoom(userData.username);

        } catch (error) {
            // Nếu có lỗi ở bất kỳ bước nào, quay lại màn hình đăng nhập
            goBackToLogin(error.message);
        }
    };

    const checkSessionAndAutoLogin = async () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            // Khi có session, tạm thời hiển thị màn hình chờ để người dùng biết hệ thống đang hoạt động
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = username;
            showSection(waitingSection);
            await findAndListenToMyRoom(username);
        } else {
            // Nếu không, hiển thị form đăng nhập như bình thường
            loginSection.classList.remove('hidden');
        }
    };

    // --- CORE GAME LOGIC & UI (RE-ARCHITECTED) ---

    const goBackToLogin = (message) => {
        if (roomListener && currentRoomId) {
            database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        }
        if (pickTimerInterval) {
            clearInterval(pickTimerInterval);
        }
        
        roomListener = null;
        pickTimerInterval = null;
        currentRoomId = null;
        
        gameSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        loginError.textContent = message;
        passwordInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Tìm và Vào Game';
    };

    async function findAndListenToMyRoom(username) {
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
                // *** CHỈ CHUYỂN GIAO DIỆN KHI ĐÃ TÌM THẤY PHÒNG ***
                loginSection.classList.add('hidden');
                gameSection.classList.remove('hidden');
                playerNameDisplay.textContent = username;
                attachListenerToSpecificRoom(username, foundRoomId);
            } else {
                goBackToLogin('Không tìm thấy phòng nào có bạn. Quản trò đã tạo game chưa?');
            }
        } catch (error) {
            console.error("Lỗi khi tìm phòng:", error);
            goBackToLogin('Đã xảy ra lỗi khi kết nối tới máy chủ.');
        }
    }

    function attachListenerToSpecificRoom(username, roomId) {
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);

        if (roomListener) roomRef.off('value', roomListener);

        roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (roomData) {
                updateGameState(username, roomId, roomData);
            } else {
                goBackToLogin('Phòng đã bị quản trò xóa.');
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
            goBackToLogin('Bạn đã bị quản trò loại khỏi phòng.');
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
        }
    }
    
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection].forEach(section => {
            section.classList.toggle('hidden', section !== sectionToShow);
        });
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