// =================================================================
// === player.js - NÂNG CẤP GIAO DIỆN HÀNH ĐỘNG ĐÊM ===
// =================================================================

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
    const rolesInGameDisplay = document.getElementById('roles-in-game-display');
    const playerActionsContainer = document.getElementById('player-actions-container');
    const roleDescriptionModal = document.getElementById('role-description-modal');
    const modalRoleName = document.getElementById('modal-role-name');
    const modalRoleFaction = document.getElementById('modal-role-faction');
    const modalRoleDescription = document.getElementById('modal-role-description');
    const votingUiSection = document.getElementById('voting-ui-section');
    const voteTitleDisplay = document.getElementById('vote-title-display');
    const voteTimerDisplay = document.getElementById('vote-timer-display');
    const voteOptionsContainer = document.getElementById('vote-options-container');
    const voteStatusMessage = document.getElementById('vote-status-message');
    const openWillModalBtn = document.getElementById('open-will-modal-btn');
    const willWritingModal = document.getElementById('will-writing-modal');
    const willTextarea = document.getElementById('will-textarea');
    const willWordCount = document.getElementById('will-word-count');
    const saveWillBtn = document.getElementById('save-will-btn');
    const saveWillStatus = document.getElementById('save-will-status');
    const publishedWillModal = document.getElementById('published-will-modal');
    const publishedWillPlayerName = document.getElementById('published-will-player-name');
    const publishedWillContent = document.getElementById('published-will-content');
    const interactiveActionSection = document.getElementById('interactive-action-section');
    const privateLogSection = document.getElementById('private-log-section');
    const privateLogContent = document.getElementById('private-log-content');
    const assassinModal = document.getElementById('assassin-modal');
    const assassinModalTitle = document.getElementById('assassin-modal-title');
    const assassinRoleChoices = document.getElementById('assassin-role-choices');

    // --- State ---
    let roomListener = null;
    let publicWillListener = null;
    let nightResultListener = null;
    let pickTimerInterval = null;
    let voteTimerInterval = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let allRolesData = [];
    let myPlayerData = {};
    let roomData = {};

    // --- DATA FETCHING ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            allRolesData = rawData.map(role => ({
                name: (role.RoleName || 'Lỗi').trim(),
                faction: (role.Faction || 'Chưa phân loại').trim(),
                description: (role.Describe || 'Không có mô tả.').trim(),
                kind: (role.Kind || 'empty').trim(),
                active: (role.Active || 'n').trim().toLowerCase(),
                quantity: parseInt(role.Quantity, 10) || 1,
                duration: (role.Duration || '1').toString().trim().toLowerCase(),
                select: (role.Select || '1').trim() // ĐỌC CỘT SELECT MỚI
            }));
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
        }
    };

    // --- Các hàm logic chính (Không thay đổi) ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.'; return;
        }
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xác thực...';
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, action: 'login' })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            sessionStorage.setItem('mywolf_username', userData.username);
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = userData.username;
            showSection(waitingSection);
            listenForRoomCreated(userData.username);

        } catch (error) {
            loginError.textContent = error.message || 'Đăng nhập thất bại.';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Vào Game';
        }
    };
    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = username;
            showSection(waitingSection);
            listenForRoomCreated(username);
        } else {
            loginSection.classList.remove('hidden');
            gameSection.classList.add('hidden');
        }
    };
    const cleanup = () => {
        if (roomListener && currentRoomId) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        if (publicWillListener && currentRoomId) database.ref(`rooms/${currentRoomId}/publicData/publishedWill`).off('value', publicWillListener);
        if (nightResultListener && currentRoomId) database.ref(`rooms/${currentRoomId}/nightResults`).off('value', nightResultListener);
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        roomListener = publicWillListener = nightResultListener = pickTimerInterval = voteTimerInterval = currentRoomId = myPlayerId = null;
    };
    function listenForRoomCreated(username) {
        cleanup();
        const roomsRef = database.ref('rooms');
        roomsRef.on('value', function(snapshot) {
            const allRooms = snapshot.val();
            let foundRoomId = null;
            if (allRooms) {
                for (const roomId in allRooms) {
                    if (allRooms[roomId].players && Object.values(allRooms[roomId].players).some(p => p.name === username)) {
                        foundRoomId = roomId;
                        break;
                    }
                }
            }
            if (foundRoomId) {
                roomsRef.off(); 
                attachListenersToRoom(username, foundRoomId);
            }
        });
    }
    function attachListenersToRoom(username, roomId) {
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            const newRoomData = snapshot.val();
            if (newRoomData) {
                roomData = newRoomData;
                updateGameState(username, roomId, roomData);
            } else {
                showSection(waitingSection);
                waitingSection.querySelector('.waiting-message').textContent = "Phòng đã bị xóa, vui lòng liên hệ quản trò!";
            }
        });
        const publicWillRef = database.ref(`rooms/${roomId}/publicData/publishedWill`);
        if(publicWillListener) publicWillRef.off('value', publicWillListener);
        publicWillListener = publicWillRef.on('value', (snapshot) => {
            const publishedWill = snapshot.val();
            if (publishedWill && publishedWill.content) {
                showPublishedWill(publishedWill);
            }
        });
        
        const nightResultRef = database.ref(`rooms/${roomId}/nightResults`);
        if (nightResultListener) nightResultRef.off('value', nightResultListener);
        nightResultListener = nightResultRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                updatePrivateLog(snapshot.val());
            } else {
                privateLogSection.classList.add('hidden');
                privateLogContent.innerHTML = '';
            }
        });
    }
    function updateGameState(username, roomId, currentRoomData) {
        roomIdDisplay.textContent = roomId;
        displayRolesInGame(currentRoomData.rolesToAssign || []);
        const myPlayerEntry = Object.entries(currentRoomData.players).find(([id, p]) => p.name === username);
        if (!myPlayerEntry) {
            showSection(waitingSection);
            playerActionsContainer.classList.add('hidden');
            waitingSection.querySelector('.waiting-message').textContent = "Bạn không có trong phòng này!";
            return;
        }
        myPlayerId = myPlayerEntry[0]; 
        myPlayerData = myPlayerEntry[1]; 
        if (myPlayerData.roleName) {
            playerActionsContainer.classList.remove('hidden');
            openWillModalBtn.disabled = !myPlayerData.isAlive;
            openWillModalBtn.textContent = myPlayerData.isAlive ? 'Viết Di Chúc' : 'Đã Chết';
        } else {
            playerActionsContainer.classList.add('hidden');
        }
        const interactiveState = currentRoomData.interactiveState;
        if (interactiveState && interactiveState.phase === 'night' && myPlayerData.isAlive) {
            hideAllGameCards();
            displayNightActions(currentRoomData, interactiveState.currentNight);
            return; 
        }
        interactiveActionSection.classList.add('hidden');
        const votingState = currentRoomData.votingState;
        if (votingState && votingState.status === 'active') {
            if (myPlayerData.isAlive) {
                showSection(votingUiSection);
                handleVotingState(username, roomId, votingState);
            } else {
                showSection(waitingSection);
                waitingSection.querySelector('h2').textContent = "Đang diễn ra vote...";
                waitingSection.querySelector('.waiting-message').textContent = "Bạn đã chết và không thể tham gia bỏ phiếu.";
            }
            return;
        }
        if (myPlayerData.roleName) {
            showSection(roleRevealSection);
            const fullRoleData = allRolesData.find(role => role.name === myPlayerData.roleName);
            updateRoleCard(fullRoleData);
        } else if (currentRoomData.playerPickState && currentRoomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, currentRoomData.playerPickState);
        } else {
            showSection(waitingSection);
            waitingSection.querySelector('h2').textContent = "Đang chờ Quản Trò...";
            waitingSection.querySelector('.waiting-message').textContent = "Chờ quản trò bắt đầu...";
        }
    }
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection, votingUiSection, interactiveActionSection].forEach(section => {
            section.classList.toggle('hidden', section !== sectionToShow);
        });
    }
    function hideAllGameCards() {
         [waitingSection, playerPickSection, roleRevealSection, votingUiSection].forEach(section => {
            section.classList.add('hidden');
        });
    }
    
    function updatePrivateLog(allNightResults) {
        if (!myPlayerId) return;

        const messages = [];
        const sortedNights = Object.keys(allNightResults).sort((a, b) => parseInt(a) - parseInt(b));

        for (const nightNumber of sortedNights) {
            const nightData = allNightResults[nightNumber];
            if (!nightData) continue;

            const publicResult = nightData.public;
            const privateResult = nightData.private?.[myPlayerId];
            const nightMessages = [];

            if (publicResult) {
                if (publicResult.deadPlayerNames && publicResult.deadPlayerNames.length > 0) {
                    nightMessages.push(`<strong>Nạn nhân:</strong> ${publicResult.deadPlayerNames.join(', ')}.`);
                } else {
                    nightMessages.push('Không có ai chết trong đêm nay.');
                }
            }

            if (privateResult) {
                nightMessages.push(`<em>Thông tin riêng:</em> ${privateResult}`);
            }

            if (nightMessages.length > 0) {
                messages.push(`<p class="log-entry"><strong>[Đêm ${nightNumber}]</strong><br>${nightMessages.join('<br>')}</p>`);
            }
        }

        if (messages.length > 0) {
            privateLogContent.innerHTML = messages.join('');
            privateLogSection.classList.remove('hidden');
        } else {
            privateLogContent.innerHTML = '';
            privateLogSection.classList.add('hidden');
        }
    }

    function showRoleDescriptionModal(roleName) {
        const roleData = allRolesData.find(r => r.name === roleName);
        if (roleData) {
            modalRoleName.textContent = roleData.name;
            modalRoleFaction.textContent = `Phe: ${roleData.faction}`;
            modalRoleDescription.textContent = roleData.description;
            roleDescriptionModal.classList.remove('hidden');
        }
    };
    function displayRolesInGame(roleNames) {
        rolesInGameDisplay.innerHTML = '';
        if (roleNames.length === 0 || allRolesData.length === 0) {
            rolesInGameDisplay.classList.add('hidden');
            return;
        }
        const instruction = document.createElement('p');
        instruction.className = 'role-list-instruction';
        instruction.innerHTML = '💡 Chạm vào một vai trò để xem mô tả';
        rolesInGameDisplay.appendChild(instruction);
        const rolesByFaction = roleNames.reduce((acc, name) => {
            const roleData = allRolesData.find(r => r.name.trim() === name.trim());
            const faction = roleData ? roleData.faction : 'Chưa phân loại';
            if (!acc[faction]) acc[faction] = [];
            acc[faction].push(name);
            return acc;
        }, {});
        const factionOrder = ['Phe Sói', 'Bầy Sói', 'Phe Dân', 'Phe trung lập', 'Chưa phân loại'];
        const getFactionClassAndIcon = (faction) => {
            if (faction === 'Phe Sói' || faction === 'Bầy Sói') return { class: 'faction-wolf', icon: 'fa-solid fa-paw' };
            if (faction === 'Phe Dân') return { class: 'faction-villager', icon: 'fa-solid fa-shield-halved' };
            if (faction === 'Phe trung lập') return { class: 'faction-neutral', icon: 'fa-solid fa-person-circle-question' };
            return { class: 'faction-unknown', icon: 'fa-solid fa-question' };
        };
        factionOrder.forEach(faction => {
            if (rolesByFaction[faction]) {
                const { class: factionClass, icon: factionIcon } = getFactionClassAndIcon(faction);
                const factionBox = document.createElement('div');
                factionBox.className = `faction-box ${factionClass}`;
                const factionTitle = document.createElement('h4');
                factionTitle.className = 'faction-title';
                factionTitle.innerHTML = `<i class="${factionIcon}"></i> ${faction}`;
                factionBox.appendChild(factionTitle);
                const rolesList = document.createElement('div');
                rolesList.className = 'roles-list';
                rolesByFaction[faction].sort().forEach(roleName => {
                    const roleItem = document.createElement('p');
                    roleItem.className = 'in-game-role-item';
                    roleItem.textContent = roleName;
                    roleItem.onclick = () => showRoleDescriptionModal(roleName);
                    rolesList.appendChild(roleItem);
                });
                factionBox.appendChild(rolesList);
                rolesInGameDisplay.appendChild(factionBox);
            }
        });
        rolesInGameDisplay.classList.remove('hidden');
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
    function handleVotingState(username, roomId, state) {
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        voteTitleDisplay.textContent = state.title;
        database.ref('/.info/serverTimeOffset').once('value', (snap) => {
            const offset = snap.val();
            const updateTimer = () => {
                const remaining = Math.round((state.endTime - (Date.now() + offset)) / 1000);
                voteTimerDisplay.textContent = remaining > 0 ? `${remaining}s` : "Hết giờ!";
                if (remaining <= 0) {
                    clearInterval(voteTimerInterval);
                    voteOptionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                    voteStatusMessage.textContent = "Đã hết thời gian vote.";
                }
            };
            updateTimer();
            voteTimerInterval = setInterval(updateTimer, 1000);
        });
        const myChoice = state.choices ? state.choices[username] : null;
        voteOptionsContainer.innerHTML = '';
        for (const playerId in state.candidates) {
            const playerName = state.candidates[playerId];
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = playerName;
            btn.dataset.targetId = playerId;
            if (playerId === myChoice) btn.classList.add('selected');
            btn.addEventListener('click', () => selectVote(username, roomId, playerId));
            voteOptionsContainer.appendChild(btn);
        }
        const skipBtn = document.createElement('button');
        skipBtn.className = 'choice-btn btn-secondary';
        skipBtn.textContent = 'Bỏ qua';
        skipBtn.dataset.targetId = 'skip_vote';
        if (myChoice === 'skip_vote') skipBtn.classList.add('selected');
        skipBtn.addEventListener('click', () => selectVote(username, roomId, 'skip_vote'));
        voteOptionsContainer.appendChild(skipBtn);
        if (myChoice) {
            voteStatusMessage.textContent = 'Bạn có thể thay đổi lựa chọn của mình.';
        } else {
            voteStatusMessage.textContent = 'Hãy bỏ phiếu...';
        }
    }
    function selectVote(username, roomId, targetId) {
        const choiceRef = database.ref(`rooms/${roomId}/votingState/choices/${username}`);
        choiceRef.once('value', (snapshot) => {
            const currentChoice = snapshot.val();
            if (currentChoice === targetId) choiceRef.set(null);
            else choiceRef.set(targetId);
        }).catch(err => console.error("Lỗi khi đọc phiếu vote:", err));
    }
    function selectRole(username, roomId, choice) {
        database.ref(`rooms/${roomId}/playerPickState/playerChoices/${username}`).set(choice)
            .catch(err => console.error("Lỗi khi gửi lựa chọn:", err));
    }
    function updateRoleCard(roleData) {
        if (!roleData) {
            document.getElementById('role-name').textContent = 'Lỗi';
            document.getElementById('role-faction').textContent = 'Không tìm thấy vai trò';
            document.getElementById('role-description').textContent = 'Không thể tải dữ liệu cho vai trò này.';
            return;
        }
        document.getElementById('role-name').textContent = roleData.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${roleData.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = roleData.description || 'Chưa có mô tả.';
        const roleFactionEl = document.getElementById('role-faction');
        const roleIconEl = document.getElementById('role-icon');
        roleFactionEl.className = 'role-faction'; 
        roleIconEl.className = 'role-icon';
        const faction = roleData.faction.trim();
        let iconClass = 'fa-solid fa-question';
        if (faction === 'Phe Sói' || faction === 'Bầy Sói') {
            roleFactionEl.classList.add('wolf');
            iconClass = 'fa-solid fa-paw';
        } else if (faction === 'Phe Dân') {
            roleFactionEl.classList.add('villager');
            iconClass = 'fa-solid fa-shield-halved';
        } else if (faction === 'Phe trung lập') {
            roleFactionEl.classList.add('neutral');
            iconClass = 'fa-solid fa-person-circle-question';
        }
        roleIconEl.className = `role-icon ${iconClass}`;
        const factionColorVar = `--${roleFactionEl.classList[1]}-color`;
        roleIconEl.style.color = getComputedStyle(document.documentElement).getPropertyValue(factionColorVar);
    }
    const countWords = (text) => {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    };
    const updateWordCount = () => {
        const text = willTextarea.value;
        const words = countWords(text);
        willWordCount.textContent = `${words}/100 từ`;
        if (words > 100) {
            willWordCount.style.color = 'var(--wolf-color)';
            saveWillBtn.disabled = true;
        } else {
            willWordCount.style.color = 'var(--light-text)';
            saveWillBtn.disabled = false;
        }
    };
    const openWillModal = () => {
        if (!currentRoomId || !myPlayerId) return;
        const willRef = database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will/content`);
        willRef.once('value').then(snapshot => {
            willTextarea.value = snapshot.val() || '';
            updateWordCount();
            saveWillStatus.textContent = '';
            willWritingModal.classList.remove('hidden');
        });
    };
    const saveWill = () => {
        if (!currentRoomId || !myPlayerId) return;
        const words = countWords(willTextarea.value);
        if (words > 100) {
            saveWillStatus.textContent = 'Di chúc quá dài, vui lòng rút gọn!';
            return;
        }
        saveWillBtn.disabled = true;
        saveWillStatus.textContent = 'Đang lưu...';
        const willData = {
            content: willTextarea.value,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will`).set(willData)
            .then(() => {
                saveWillStatus.textContent = 'Đã lưu thành công!';
                setTimeout(() => {
                    willWritingModal.classList.add('hidden');
                    saveWillBtn.disabled = false;
                }, 1500);
            })
            .catch(err => {
                saveWillStatus.textContent = 'Lỗi: ' + err.message;
                saveWillBtn.disabled = false;
            });
    };
    const showPublishedWill = (willData) => {
        publishedWillPlayerName.textContent = `Di Chúc của ${willData.playerName}`;
        publishedWillContent.textContent = willData.content || "Người này không để lại di chúc.";
        publishedWillModal.classList.remove('hidden');
    };

    function openAssassinModal(targetId, targetName) {
        assassinModalTitle.textContent = `Đoán vai trò của ${targetName}`;
        assassinRoleChoices.innerHTML = '';

        const rolesInGame = [...new Set(roomData.rolesToAssign || [])];
        
        rolesInGame.forEach(roleName => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = roleName;
            btn.onclick = () => handleRoleGuess(targetId, roleName);
            assassinRoleChoices.appendChild(btn);
        });

        assassinModal.classList.remove('hidden');
    }

    function handleRoleGuess(targetId, guessedRole) {
        const currentNight = roomData.interactiveState?.currentNight;
        if (!currentNight) return;

        const actionPath = `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;
        const actionData = {
            action: 'assassinate',
            targetId: targetId,
            guess: guessedRole
        };

        database.ref(actionPath).set(actionData).then(() => {
            assassinModal.classList.add('hidden');
            displayNightActions(roomData, currentNight);
        });
    }

    // =================================================================
    // === CÁC HÀM MỚI VÀ ĐƯỢC CẬP NHẬT CHO GIAO DIỆN HÀNH ĐỘNG ĐÊM ===
    // =================================================================
    
    /**
     * Hàm kiểm tra xem một hành động có thể sử dụng trong đêm hiện tại không.
     * @param {object} roleData - Dữ liệu đầy đủ của vai trò.
     * @param {string} actionKey - Key của hành động (vd: 'kill', 'protect').
     * @param {number} currentNight - Số đêm hiện tại.
     * @returns {boolean} - True nếu có thể sử dụng.
     */
    function isActionAvailable(roleData, actionKey, currentNight) {
        const activeRule = roleData.active;
        const parts = activeRule.split('_');
        const usesRule = parts[0];
        const startNightRule = parts.length > 1 ? parseInt(parts[1], 10) : 1;

        if (currentNight < startNightRule) return false;

        const useLimit = (usesRule === 'n') ? Infinity : parseInt(usesRule, 10);
        if (isNaN(useLimit)) return false;

        if (useLimit !== Infinity) {
            let timesUsed = 0;
            const allNightActions = roomData.nightActions || {};
            for (const night in allNightActions) {
                if (allNightActions[night][myPlayerId]?.action === actionKey) {
                    timesUsed++;
                }
            }
            if (timesUsed >= useLimit) return false;
        }
        return true;
    }

    /**
     * Hàm chính để hiển thị toàn bộ giao diện hành động đêm.
     */
    function displayNightActions(currentRoomData, currentNight) {
        interactiveActionSection.innerHTML = '';
        interactiveActionSection.classList.remove('hidden');

        const myRoleData = allRolesData.find(r => r.name === myPlayerData.roleName) || {};
        const myNightAction = currentRoomData.nightActions?.[currentNight]?.[myPlayerId];
        const wolfNightAction = currentRoomData.nightActions?.[currentNight]?.wolf_group;

        // --- Trường hợp đã hành động ---
        if (myNightAction || (wolfNightAction?.votes?.[myPlayerId])) {
            let actionText = "hành động";
            let targetText = "";

            const actionData = myNightAction || wolfNightAction;
            const myVote = wolfNightAction?.votes?.[myPlayerId];
            
            if (actionData) {
                 const actionKey = myNightAction?.action || wolfNightAction?.action;
                 actionText = ALL_ACTIONS[actionKey]?.label || actionText;

                 const targetIds = myNightAction?.targets || (myVote ? [myVote] : []);
                 if (targetIds.length > 0) {
                     const targetNames = targetIds.map(tid => currentRoomData.players[tid]?.name || '???').join(', ');
                     targetText = `lên <strong>${targetNames}</strong>`;
                 }
            }
            
            interactiveActionSection.innerHTML = `
                <div class="night-action-panel">
                    <div class="action-locked-overlay">
                        <div class="icon"><i class="fas fa-check-circle"></i></div>
                        <h3>Đã xác nhận</h3>
                        <p>Bạn đã ${actionText} ${targetText}</p>
                    </div>
                </div>`;
            return;
        }

        // --- Thu thập tất cả các hành động có thể có ---
        const availableActions = [];
        const isWolfFaction = myRoleData.faction === 'Bầy Sói' || myRoleData.faction === 'Phe Sói';

        // 1. Hành động của Sói
        if (isWolfFaction) {
            availableActions.push({ title: "Cắn", description: "Cùng bầy sói chọn một mục tiêu để loại bỏ.", actionKey: 'kill', isWolfGroupAction: true, roleInfo: { quantity: 1 }});
            const curseState = currentRoomData.interactiveState?.curseAbility?.status || 'locked';
            if (curseState === 'available') {
                 availableActions.push({ title: "Nguyền", description: "Biến một người chơi thành Sói. Đêm nay sẽ không có ai bị cắn.", actionKey: 'curse', isWolfGroupAction: true, roleInfo: { quantity: 1 }});
            }
        }

        // 2. Hành động cá nhân
        const kinds = myRoleData.kind ? myRoleData.kind.split('_') : [];
        kinds.forEach(kind => {
            const actionInfo = KIND_TO_ACTION_MAP[kind];
            if (!actionInfo || (isWolfFaction && kind === 'kill') || kind === 'empty') return;
            
            if (isActionAvailable(myRoleData, actionInfo.key, currentNight)) {
                if(kind === 'assassin') {
                    // Xử lý riêng cho Assassin
                    availableActions.push({ title: "Ám Sát", description: "Chọn mục tiêu để đoán vai trò.", actionKey: 'assassinate', isSpecial: 'assassin', roleInfo: myRoleData });
                } else if(kind === 'wizard') {
                     const wizardState = myPlayerData.wizardAbilityState || 'save_available';
                     if(wizardState === 'save_available') {
                        availableActions.push({ title: "Cứu Thế", description: "Cứu tất cả người bị giết. Nếu không ai chết, bạn chết thay.", actionKey: 'wizard_save', isSpecial: 'wizard_save', roleInfo: myRoleData });
                     } else if (wizardState === 'kill_available') {
                        availableActions.push({ title: `Giết`, description: `Bạn có 1 lần Giết sau khi Cứu Thế thành công.`, actionKey: 'wizard_kill', isWolfGroupAction: false, roleInfo: { ...myRoleData, quantity: 1 } });
                     }
                }
                else {
                    availableActions.push({ title: actionInfo.label, description: `Chọn mục tiêu để thực hiện chức năng.`, actionKey: actionInfo.key, isWolfGroupAction: false, roleInfo: myRoleData });
                }
            }
        });

        // --- Render giao diện ---
        if (availableActions.length === 0) {
            interactiveActionSection.innerHTML = `
                <div class="night-action-panel">
                    <div class="panel-header">
                        <h2>Thư giãn</h2>
                        <p>Đêm nay bạn không có chức năng. Hãy chờ trời sáng.</p>
                    </div>
                </div>`;
            return;
        }

        // Tạo cấu trúc giao diện chính
        const panel = document.createElement('div');
        panel.className = 'night-action-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h2 id="panel-title">Hành Động Đêm</h2>
                <p id="panel-description">Chọn hành động và mục tiêu của bạn.</p>
            </div>
            <div class="action-tabs" id="action-tabs-container"></div>
            <div id="action-content"></div>
        `;
        interactiveActionSection.appendChild(panel);

        const tabsContainer = panel.querySelector('#action-tabs-container');
        
        // Tạo các tab nếu có nhiều hơn 1 hành động
        if (availableActions.length > 1) {
            availableActions.forEach((action, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'tab-btn';
                tabBtn.textContent = action.title;
                tabBtn.dataset.actionIndex = index;
                if (index === 0) tabBtn.classList.add('active');
                tabBtn.addEventListener('click', () => {
                    tabsContainer.querySelector('.active').classList.remove('active');
                    tabBtn.classList.add('active');
                    renderActionContent(availableActions[index]);
                });
                tabsContainer.appendChild(tabBtn);
            });
        }

        // Render nội dung cho hành động đầu tiên
        renderActionContent(availableActions[0]);
    }

    /**
     * Render nội dung chi tiết của một hành động (danh sách mục tiêu, nút xác nhận).
     */
    function renderActionContent(actionDetails) {
        const contentContainer = document.getElementById('action-content');
        const panelTitle = document.getElementById('panel-title');
        const panelDescription = document.getElementById('panel-description');
        
        panelTitle.textContent = actionDetails.title;
        const targetLimit = actionDetails.roleInfo.quantity || 1;
        panelDescription.textContent = targetLimit > 1 
            ? `${actionDetails.description} (Chọn tối đa ${targetLimit})`
            : actionDetails.description;
            
        contentContainer.innerHTML = ''; // Xóa nội dung cũ

        // Xử lý các trường hợp đặc biệt
        if (actionDetails.isSpecial === 'assassin') {
            contentContainer.appendChild(createAssassinTargetPanel());
            return;
        }
        if (actionDetails.isSpecial === 'wizard_save') {
             contentContainer.appendChild(createWizardSavePanel());
             return;
        }

        const livingPlayers = Object.entries(roomData.players).filter(([, p]) => p.isAlive);
        const currentNight = roomData.interactiveState.currentNight;

        // Tạo lưới mục tiêu và nút xác nhận
        const targetGrid = document.createElement('div');
        targetGrid.className = 'target-grid';
        
        const footer = document.createElement('div');
        footer.className = 'panel-footer';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = `Xác nhận ${actionDetails.title}`;
        confirmBtn.disabled = true;
        footer.appendChild(confirmBtn);

        // Lấy thông tin vote của sói
        const wolfActionData = roomData.nightActions?.[currentNight]?.wolf_group || {};
        const wolfVotes = wolfActionData.votes || {};
        const voteCounts = Object.values(wolfVotes).reduce((acc, targetId) => {
            acc[targetId] = (acc[targetId] || 0) + 1;
            return acc;
        }, {});

        livingPlayers.forEach(([id, player]) => {
            const card = document.createElement('div');
            card.className = 'target-card';
            card.dataset.playerId = id;
            
            let playerName = player.name;
            if(myPlayerId === id) playerName += ' (Bạn)';

            card.innerHTML = `<p class="player-name">${playerName}</p>`;
            
            // Hiển thị số phiếu sói
            if (actionDetails.isWolfGroupAction && voteCounts[id] > 0) {
                const voteCountEl = document.createElement('div');
                voteCountEl.className = 'wolf-vote-count';
                voteCountEl.textContent = voteCounts[id];
                card.appendChild(voteCountEl);
            }
            targetGrid.appendChild(card);
        });

        contentContainer.appendChild(targetGrid);
        contentContainer.appendChild(footer);

        // Thêm logic chọn mục tiêu
        const allCards = targetGrid.querySelectorAll('.target-card');
        targetGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.target-card');
            if (!card || card.classList.contains('disabled')) return;

            const isMultiSelect = targetLimit > 1;
            if(isMultiSelect) {
                card.classList.toggle('selected');
            } else {
                allCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            }

            const selectedCards = targetGrid.querySelectorAll('.selected');
            if (selectedCards.length > targetLimit) {
                card.classList.remove('selected');
            }
            
            confirmBtn.disabled = targetGrid.querySelectorAll('.selected').length === 0;
        });

        // Thêm logic nút xác nhận
        confirmBtn.addEventListener('click', () => {
             const selectedTargets = Array.from(targetGrid.querySelectorAll('.selected')).map(c => c.dataset.playerId);
             if (selectedTargets.length === 0) return;

             const actionPath = actionDetails.isWolfGroupAction
                ? `rooms/${currentRoomId}/nightActions/${currentNight}/wolf_group`
                : `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;

             if (actionDetails.isWolfGroupAction) {
                const updates = {};
                updates[`${actionPath}/action`] = actionDetails.actionKey;
                updates[`${actionPath}/votes/${myPlayerId}`] = selectedTargets[0];
                database.ref().update(updates);
             } else {
                database.ref(actionPath).set({ action: actionDetails.actionKey, targets: selectedTargets });
             }
        });
    }

    function createAssassinTargetPanel() {
        const container = document.createElement('div');
        const livingPlayers = Object.entries(roomData.players).filter(([, p]) => p.isAlive);
        const targetGrid = document.createElement('div');
        targetGrid.className = 'target-grid';
        
        livingPlayers.forEach(([id, player]) => {
            if (id === myPlayerId) return;
            const card = document.createElement('div');
            card.className = 'target-card';
            card.innerHTML = `<p class="player-name">${player.name}</p>`;
            card.onclick = () => openAssassinModal(id, player.name);
            targetGrid.appendChild(card);
        });
        container.appendChild(targetGrid);
        return container;
    }
    
    function createWizardSavePanel() {
         const container = document.createElement('div');
         container.style.textAlign = 'center';
         const currentNight = roomData.interactiveState.currentNight;
         
         const useBtn = document.createElement('button');
         useBtn.textContent = 'Sử Dụng Cứu Thế';
         useBtn.style.marginRight = '10px';
         useBtn.onclick = () => {
             database.ref(`rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`).set({ action: 'wizard_save', targets: [] });
         };

         const skipBtn = document.createElement('button');
         skipBtn.textContent = 'Không Sử Dụng';
         skipBtn.className = 'btn-secondary';
         skipBtn.onclick = () => {
             container.innerHTML = `<p>Bạn đã quyết định không dùng Cứu Thế đêm nay.</p>`;
         };

         container.append(useBtn, skipBtn);
         return container;
    }


    // --- EVENT LISTENERS ---
    const eventListeners = [
        { el: loginBtn, event: 'click', handler: handleLogin },
        { el: passwordInput, event: 'keyup', handler: (e) => { if (e.key === 'Enter') loginBtn.click(); } },
        { el: roleRevealSection, event: 'click', handler: () => roleRevealSection.classList.toggle('is-flipped') },
        { el: randomChoiceBtn, event: 'click', handler: () => {
            if (currentRoomId) {
                const username = sessionStorage.getItem('mywolf_username');
                if (username) selectRole(username, currentRoomId, 'random');
            }
        }},
        { el: roleDescriptionModal, event: 'click', handler: (e) => {
            if (e.target === roleDescriptionModal || e.target.classList.contains('close-modal-btn')) {
                roleDescriptionModal.classList.add('hidden');
            }
        }},
        { el: openWillModalBtn, event: 'click', handler: openWillModal },
        { el: willTextarea, event: 'input', handler: updateWordCount },
        { el: saveWillBtn, event: 'click', handler: saveWill }
    ];
    eventListeners.forEach(({ el, event, handler }) => {
        if (el) el.addEventListener(event, handler);
    });
    [willWritingModal, publishedWillModal, assassinModal].forEach(modal => { 
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('close-modal-btn')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });

    // --- INITIAL LOAD ---
    const initialize = async () => {
        await fetchAllRolesData();
        checkSessionAndAutoLogin();
    };
    initialize();
});