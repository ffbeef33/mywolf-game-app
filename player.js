// =================================================================
// === player.js - LẤY QUOTES NGẪU NHIÊN & THÊM MINI GAME MỚI (FIXED) ===
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
    const wolfActionChoiceModal = document.getElementById('wolf-action-choice-modal');

    // === DOM ELEMENTS CHO MINI GAME ===
    const minigameSection = document.getElementById('minigame-section');
    const minigameTitle = document.getElementById('minigame-title');
    const minigameRules = document.getElementById('minigame-rules');
    const minigameOptionsContainer = document.getElementById('minigame-options-container');
    const minigameConfirmBtn = document.getElementById('minigame-confirm-btn');
    const minigameStatusMessage = document.getElementById('minigame-status-message');
    
    // === DOM ELEMENTS CHO MINI GAME MỚI ===
    const mathWhizSection = document.getElementById('math-whiz-section');
    const mathTimerDisplay = document.getElementById('math-timer-display');
    const mathProblemDisplay = document.getElementById('math-problem-display');
    const mathOptionsContainer = document.getElementById('math-options-container');
    const mathStatusMessage = document.getElementById('math-status-message');

    // === BIẾN MỚI CHO VONG HỒN TRỞ LẠI ===
    const returningSpiritSection = document.getElementById('returning-spirit-section');
    const spiritRoundDisplay = document.getElementById('spirit-round-display');
    const spiritDoorOptions = document.getElementById('spirit-door-options');
    const spiritStatusMessage = document.getElementById('spirit-status-message');


    // --- State ---
    let roomListener = null;
    let publicWillListener = null;
    let nightResultListener = null;
    let announcementListener = null;
    let pickTimerInterval = null;
    let voteTimerInterval = null;
    let mathGameTimerInterval = null; // Thêm timer cho game toán
    let currentRoomId = null;
    let myPlayerId = null;
    let allRolesData = [];
    let myPlayerData = {};
    let roomData = {};
    let allNightQuotes = [];

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
                select: (role.Select || '1').trim()
            }));
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
        }
    };

    const fetchNightQuotes = async () => {
        try {
            const response = await fetch('/api/sheets?sheetName=Quotes');
            if (!response.ok) {
                console.error('Không thể tải danh sách quotes.');
                allNightQuotes = ["Đêm đã buông xuống... Hãy cẩn thận."]; // Fallback
                return;
            }
            allNightQuotes = await response.json();
        } catch (error) {
            console.error("Lỗi khi tải quotes:", error);
            allNightQuotes = ["Bạn lắng nghe trong im lặng, chờ đợi trời sáng."]; // Fallback
        }
    };

    const showAnnouncementModal = (data) => {
        const modal = document.getElementById('announcement-modal');
        const content = document.getElementById('announcement-content');
        if (modal && content && data.message) {
            content.textContent = data.message;
            modal.classList.remove('hidden');
        }
    };

    // --- Các hàm logic chính ---
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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password,
                    action: 'login'
                })
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
        if (announcementListener && currentRoomId) database.ref(`rooms/${currentRoomId}/publicData/latestAnnouncement`).off('value', announcementListener);
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        if (mathGameTimerInterval) clearInterval(mathGameTimerInterval); // Dọn dẹp timer mới
        roomListener = publicWillListener = nightResultListener = announcementListener = pickTimerInterval = voteTimerInterval = mathGameTimerInterval = currentRoomId = myPlayerId = null;
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
        if (publicWillListener) publicWillRef.off('value', publicWillListener);
        publicWillListener = publicWillRef.on('value', (snapshot) => {
            const publishedWill = snapshot.val();
            if (publishedWill && publishedWill.content) {
                showPublishedWill(publishedWill);
            }
        });

        const announcementRef = database.ref(`rooms/${roomId}/publicData/latestAnnouncement`);
        if (announcementListener) announcementRef.off('value', announcementListener);
        announcementListener = announcementRef.on('value', (snapshot) => {
            const announcement = snapshot.val();
            if (announcement && (Date.now() - announcement.timestamp < 60000)) {
                showAnnouncementModal(announcement);
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

        const minigameState = currentRoomData.minigameState;
        if (minigameState && minigameState.status === 'active' && minigameState.participants[myPlayerId]) {
            if (minigameState.gameType === 'night_of_trust') {
                showSection(minigameSection);
                handleMinigameState(minigameState);
            } else if (minigameState.gameType === 'math_whiz') {
                showSection(mathWhizSection);
                handleMathWhizState(minigameState);
            }
            else if (minigameState.gameType === 'returning_spirit') {
                showSection(returningSpiritSection);
                handleReturningSpiritState(minigameState);
            }
            return;
        }

        const interactiveState = currentRoomData.interactiveState;
        if (interactiveState && interactiveState.phase === 'night' && myPlayerData.isAlive) {
            hideAllGameCards();
            displayNightActions(currentRoomData, interactiveState.currentNight);
            return;
        }
        interactiveActionSection.classList.add('hidden');
        wolfActionChoiceModal.classList.add('hidden');
        const votingState = currentRoomData.votingState;
        if (votingState && votingState.status === 'active') {
            if (myPlayerData.isAlive) {
                if (votingState.voters && votingState.voters[myPlayerId]) {
                    showSection(votingUiSection);
                    handleVotingState(username, roomId, votingState);
                } else {
                    showSection(waitingSection);
                    waitingSection.querySelector('h2').textContent = "Đang diễn ra vote...";
                    waitingSection.querySelector('.waiting-message').textContent = "Bạn không đủ điều kiện tham gia bỏ phiếu lần này (do không tương tác trong đêm).";
                }
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
        [waitingSection, playerPickSection, roleRevealSection, votingUiSection, interactiveActionSection, minigameSection, mathWhizSection, returningSpiritSection].forEach(section => {
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
            const privateResult = nightData.private && nightData.private[myPlayerId];
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
            if (faction === 'Phe Sói' || faction === 'Bầy Sói') return {
                class: 'faction-wolf',
                icon: 'fa-solid fa-paw'
            };
            if (faction === 'Phe Dân') return {
                class: 'faction-villager',
                icon: 'fa-solid fa-shield-halved'
            };
            if (faction === 'Phe trung lập') return {
                class: 'faction-neutral',
                icon: 'fa-solid fa-person-circle-question'
            };
            return {
                class: 'faction-unknown',
                icon: 'fa-solid fa-question'
            };
        };
        factionOrder.forEach(faction => {
            if (rolesByFaction[faction]) {
                const {
                    class: factionClass,
                    icon: factionIcon
                } = getFactionClassAndIcon(faction);
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
        document.getElementById('role-name').textContent = myPlayerData.roleName || 'Chưa có tên';
        const faction = myPlayerData.currentFaction || roleData.faction || 'Chưa rõ';
        document.getElementById('role-faction').textContent = `Phe ${faction}`;
        document.getElementById('role-description').textContent = roleData.description || 'Chưa có mô tả.';
        const roleFactionEl = document.getElementById('role-faction');
        const roleIconEl = document.getElementById('role-icon');
        roleFactionEl.className = 'role-faction';
        roleIconEl.className = 'role-icon';

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
        const currentNight = roomData.interactiveState && roomData.interactiveState.currentNight;
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

    // === LOGIC CHO MINI GAME ===
    function handleMinigameState(state) {
        minigameTitle.textContent = state.title;
        const myChoice = state.choices ? state.choices[myPlayerId] : [];
        const hasChosen = Array.isArray(myChoice) && myChoice.length > 0;

        if (state.gameType === 'night_of_trust') {
            minigameRules.textContent = "Chọn 2 người chơi bạn tin tưởng nhất. Người không được ai tin tưởng sẽ chết.";

            if (hasChosen) {
                const chosenNames = myChoice.map(id => state.participants[id] || 'người chơi không xác định').join(', ');
                minigameOptionsContainer.innerHTML = `<p>Bạn đã chọn tin tưởng: <strong>${chosenNames}</strong>.</p>`;
                minigameConfirmBtn.style.display = 'none';
                minigameStatusMessage.textContent = "Đã ghi nhận lựa chọn. Đang chờ những người khác...";
                return;
            }

            minigameOptionsContainer.innerHTML = '';
            minigameConfirmBtn.style.display = 'block';
            minigameConfirmBtn.disabled = true;

            for (const pId in state.participants) {
                if (pId !== myPlayerId) { // Không thể tự chọn mình
                    const playerName = state.participants[pId];
                    const btn = document.createElement('button');
                    btn.className = 'choice-btn';
                    btn.textContent = playerName;
                    btn.dataset.targetId = pId;
                    minigameOptionsContainer.appendChild(btn);
                }
            }

            minigameStatusMessage.textContent = 'Hãy chọn 2 người.';

            // Xóa event listener cũ để tránh bị chồng chéo
            const newOptionsContainer = minigameOptionsContainer.cloneNode(true);
            minigameOptionsContainer.parentNode.replaceChild(newOptionsContainer, minigameOptionsContainer);

            newOptionsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('choice-btn')) {
                    e.target.classList.toggle('selected');
                    const selectedCount = newOptionsContainer.querySelectorAll('.selected').length;

                    newOptionsContainer.querySelectorAll('.choice-btn:not(.selected)').forEach(btn => {
                        btn.disabled = (selectedCount >= 2);
                    });

                    minigameConfirmBtn.disabled = (selectedCount !== 2);
                }
            });
            // Gán lại biến DOM sau khi clone
            minigameOptionsContainer = newOptionsContainer;
        }
    }
    
    // === LOGIC MINI GAME MỚI: THẦN ĐỒNG TOÁN HỌC ===
    function handleMathWhizState(state) {
        if (mathGameTimerInterval) clearInterval(mathGameTimerInterval);
        
        const mySubmission = state.submissions ? state.submissions[myPlayerId] : null;

        const updateTimer = () => {
            const remaining = Math.round((state.endTime - Date.now()) / 1000);
            mathTimerDisplay.textContent = remaining > 0 ? `${remaining}s` : "Hết giờ!";
            if (remaining <= 0) {
                clearInterval(mathGameTimerInterval);
                mathOptionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                if (!mySubmission) {
                    mathStatusMessage.textContent = "Đã hết thời gian!";
                }
            }
        };
        updateTimer();
        mathGameTimerInterval = setInterval(updateTimer, 1000);

        mathProblemDisplay.textContent = `${state.problem.question} = ?`;
        mathOptionsContainer.innerHTML = '';
        
        if (mySubmission) {
            mathStatusMessage.textContent = "Bạn đã trả lời. Đang chờ kết quả...";
            state.problem.answers.forEach(answer => {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = answer;
                btn.disabled = true;
                if (answer == mySubmission.answer) {
                    btn.classList.add('selected');
                }
                mathOptionsContainer.appendChild(btn);
            });
            return;
        }

        mathStatusMessage.textContent = "Chọn đáp án đúng và nhanh nhất!";
        state.problem.answers.forEach(answer => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = answer;
            btn.addEventListener('click', () => {
                const submission = {
                    answer: answer,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };
                database.ref(`rooms/${currentRoomId}/minigameState/submissions/${myPlayerId}`).set(submission);
            });
            mathOptionsContainer.appendChild(btn);
        });
    }

    // --- LOGIC MỚI CHO HÀNH ĐỘNG ĐÊM ---
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
                const nightAction = allNightActions[night] && allNightActions[night][myPlayerId];
                if (nightAction && nightAction.action === actionKey) {
                    timesUsed++;
                }
            }
            if (timesUsed >= useLimit) return false;
        }
        return true;
    }

    function displayNightActions(currentRoomData, currentNight) {
        interactiveActionSection.innerHTML = '';
        interactiveActionSection.classList.remove('hidden');

        const myRoleData = allRolesData.find(r => r.name === myPlayerData.roleName) || {};
        const isWolfFaction = myPlayerData.currentFaction === 'Bầy Sói' || myRoleData.faction === 'Bầy Sói' || myRoleData.faction === 'Phe Sói';

        const availableActions = [];

        if (isWolfFaction) {
            const curseState = (currentRoomData.interactiveState && currentRoomData.interactiveState.curseAbility && currentRoomData.interactiveState.curseAbility.status) || 'locked';
            const wolfAction = (currentRoomData.nightActions && currentRoomData.nightActions[currentNight] && currentRoomData.nightActions[currentNight].wolf_group && currentRoomData.nightActions[currentNight].wolf_group.action);

            if (curseState === 'available' && !wolfAction) {
                wolfActionChoiceModal.classList.remove('hidden');
                return;
            }
            wolfActionChoiceModal.classList.add('hidden');

            const actionToDisplay = wolfAction === 'curse' ? 'curse' : 'kill';
            const title = actionToDisplay === 'curse' ? 'Nguyền' : 'Cắn';
            const desc = actionToDisplay === 'curse' ? 'Biến một người chơi thành Sói.' : 'Cùng bầy sói chọn một mục tiêu để loại bỏ.';

            availableActions.push({
                title: title,
                description: desc,
                actionKey: actionToDisplay,
                isWolfGroupAction: true,
                roleInfo: {
                    quantity: 1,
                    ...myRoleData
                }
            });
        }

        const kinds = myRoleData.kind ? myRoleData.kind.split('_') : [];
        kinds.forEach(kind => {
            const actionInfo = KIND_TO_ACTION_MAP[kind];
            if (!actionInfo || (isWolfFaction && kind === 'kill') || kind === 'empty') {
                return;
            }

            if (isActionAvailable(myRoleData, actionInfo.key, currentNight)) {
                if (kind === 'assassin') {
                    availableActions.push({
                        title: "Ám Sát",
                        description: "Chọn mục tiêu để đoán vai trò.",
                        actionKey: 'assassinate',
                        isSpecial: 'assassin',
                        roleInfo: myRoleData
                    });
                } else if (kind === 'wizard') {
                    const wizardState = myPlayerData.wizardAbilityState || 'save_available';
                    if (wizardState === 'save_available') {
                        availableActions.push({
                            title: "Cứu Thế",
                            description: "Cứu tất cả người bị giết. Nếu không ai chết, bạn chết thay.",
                            actionKey: 'wizard_save',
                            isSpecial: 'wizard_save',
                            roleInfo: myRoleData
                        });
                    } else if (wizardState === 'kill_available') {
                        availableActions.push({
                            title: `Giết`,
                            description: `Bạn có 1 lần Giết sau khi Cứu Thế thành công.`,
                            actionKey: 'wizard_kill',
                            isWolfGroupAction: false,
                            roleInfo: { ...myRoleData,
                                quantity: 1
                            }
                        });
                    }
                } else {
                    availableActions.push({
                        title: actionInfo.label,
                        description: `Chọn mục tiêu để thực hiện chức năng.`,
                        actionKey: actionInfo.key,
                        isWolfGroupAction: false,
                        roleInfo: myRoleData
                    });
                }
            }
        });

        if (availableActions.length === 0) {
            const myNightlyQuestion = currentRoomData.interactiveState && currentRoomData.interactiveState.nightlyQuestions && currentRoomData.interactiveState.nightlyQuestions[myPlayerId];
            if (myNightlyQuestion && myNightlyQuestion.questionText) {
                renderNightlyQuestionPanel(myNightlyQuestion);
            } else {
                renderRestingPanel();
            }
            return;
        }

        renderActionPanel(availableActions);
    }

    function renderNightlyQuestionPanel(questionData) {
        interactiveActionSection.innerHTML = '';

        if (questionData.answer) {
            interactiveActionSection.innerHTML = `
                <div class="night-action-panel resting-panel">
                    <div class="panel-header" style="text-align: center;">
                        <h2>Đã Trả Lời</h2>
                    </div>
                    <div class="action-locked-overlay" style="padding: 10px;">
                        <div class="icon"><i class="fas fa-check-circle"></i></div>
                        <h3>Đã Ghi Nhận</h3>
                        <p>Câu trả lời của bạn đã được ghi nhận. Hãy chờ trời sáng.</p>
                    </div>
                </div>`;
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'night-action-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h2 id="panel-title" style="text-align: center;">Mini-game: Trả lời câu hỏi</h2>
                <p id="panel-description" style="font-size: 1.2rem; text-align: center; margin-top: 15px; color: var(--light-text); font-style: italic;">"${questionData.questionText}"</p>
            </div>
            <div id="action-content" style="display: flex; justify-content: center; gap: 20px; margin-top: 25px;">
                <button class="choice-btn" id="yes-btn" style="width: 120px; background-color: var(--button-bg);">Yes</button>
                <button class="choice-btn" id="no-btn" style="width: 120px; background-color: var(--wolf-color);">No</button>
            </div>
            <p style="text-align: center; opacity: 0.7; font-size: 0.9em; margin-top: 20px;">Bạn phải trả lời để có thể tham gia biểu quyết vào ngày mai.</p>
        `;
        interactiveActionSection.appendChild(panel);

        const answerPath = `rooms/${currentRoomId}/interactiveState/nightlyQuestions/${myPlayerId}/answer`;

        panel.querySelector('#yes-btn').addEventListener('click', () => {
            database.ref(answerPath).set('yes');
        });

        panel.querySelector('#no-btn').addEventListener('click', () => {
            database.ref(answerPath).set('no');
        });
    }

    function renderActionPanel(actions) {
        const actionDetailsArray = Array.isArray(actions) ? actions : [actions];

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

        if (actionDetailsArray.length > 1) {
            actionDetailsArray.forEach((action, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'tab-btn';
                tabBtn.textContent = action.title;
                if (index === 0) tabBtn.classList.add('active');
                tabBtn.addEventListener('click', () => {
                    tabsContainer.querySelector('.active').classList.remove('active');
                    tabBtn.classList.add('active');
                    renderActionContent(action);
                });
                tabsContainer.appendChild(tabBtn);
            });
        }

        renderActionContent(actionDetailsArray[0]);
    }

    function renderRestingPanel() {
        let randomMessage = "Bạn không có hành động nào đêm nay. Hãy cố gắng nghỉ ngơi và chuẩn bị cho ngày mai.";
        if (allNightQuotes && allNightQuotes.length > 0) {
            randomMessage = allNightQuotes[Math.floor(Math.random() * allNightQuotes.length)];
        }

        interactiveActionSection.innerHTML = `
            <div class="night-action-panel resting-panel">
                <div class="panel-header">
                    <h2>Đêm Tĩnh Lặng</h2>
                    <p class="atmospheric-message"><em>${randomMessage}</em></p>
                </div>
                <div class="resting-info">
                    <p>Bạn không có hành động nào đêm nay. Hãy cố gắng nghỉ ngơi và chuẩn bị cho ngày mai.</p>
                </div>
            </div>`;
    }

    function renderActionContent(actionDetails) {
        const contentContainer = document.getElementById('action-content');
        if (!contentContainer) return;
        contentContainer.innerHTML = '';

        const panelTitle = document.getElementById('panel-title');
        const panelDescription = document.getElementById('panel-description');

        panelTitle.textContent = actionDetails.title;
        const targetLimit = actionDetails.roleInfo.quantity || 1;
        panelDescription.textContent = targetLimit > 1 ?
            `${actionDetails.description} (Chọn tối đa ${targetLimit})` :
            actionDetails.description;

        const currentNight = roomData.interactiveState.currentNight;
        const myNightAction = (roomData.nightActions && roomData.nightActions[currentNight]) ? roomData.nightActions[currentNight][myPlayerId] : null;
        const wolfVoteData = (roomData.nightActions && roomData.nightActions[currentNight] && roomData.nightActions[currentNight].wolf_group) ? roomData.nightActions[currentNight].wolf_group.votes : null;
        const wolfVote = wolfVoteData ? wolfVoteData[myPlayerId] : null;
        const wolfActionChoice = (roomData.nightActions && roomData.nightActions[currentNight] && roomData.nightActions[currentNight].wolf_group) ? roomData.nightActions[currentNight].wolf_group.action : null;

        let isActionConfirmed = false;
        let confirmedTargetIds = [];

        if (actionDetails.isWolfGroupAction && wolfVote && wolfActionChoice === actionDetails.actionKey) {
            isActionConfirmed = true;
            confirmedTargetIds.push(wolfVote);
        } else if (!actionDetails.isWolfGroupAction && myNightAction && myNightAction.action === actionDetails.actionKey) {
            isActionConfirmed = true;
            confirmedTargetIds = myNightAction.targets;
        }

        if (isActionConfirmed) {
            const targetNames = confirmedTargetIds.map(tid => (roomData.players[tid] && roomData.players[tid].name) || '???').join(', ');
            contentContainer.innerHTML = `
                <div class="action-locked-overlay">
                    <div class="icon"><i class="fas fa-check-circle"></i></div>
                    <h3>Đã xác nhận</h3>
                    <p>Bạn đã ${actionDetails.title} lên <strong>${targetNames}</strong>. Chờ đồng bọn...</p>
                </div>`;
            return;
        }

        if (actionDetails.isSpecial === 'assassin') {
            contentContainer.appendChild(createAssassinTargetPanel());
            return;
        }
        if (actionDetails.isSpecial === 'wizard_save') {
            contentContainer.appendChild(createWizardSavePanel());
            return;
        }

        let targetPlayers;
        if (actionDetails.actionKey === 'detect') {
            targetPlayers = Object.entries(roomData.players).filter(([, p]) => !p.isAlive);
            if (targetPlayers.length === 0) {
                panelDescription.textContent = "Hiện không có người chơi nào đã chết để điều tra.";
            }
        } else {
            targetPlayers = Object.entries(roomData.players).filter(([, p]) => p.isAlive);
        }

        const previousNight = currentNight - 1;
        let previousTargetIds = [];

        if (actionDetails.roleInfo.select === '0' && previousNight > 0) {
            const previousAction = actionDetails.isWolfGroupAction
                ? (roomData.nightActions && roomData.nightActions[previousNight] ? roomData.nightActions[previousNight].wolf_group : null)
                : (roomData.nightActions && roomData.nightActions[previousNight] ? roomData.nightActions[previousNight][myPlayerId] : null);

            if (previousAction) {
                if(actionDetails.isWolfGroupAction) {
                    const previousVote = previousAction.votes && previousAction.votes[myPlayerId];
                    if(previousVote) {
                        previousTargetIds.push(previousVote);
                    }
                } else if (previousAction.action === actionDetails.actionKey) {
                    previousTargetIds = previousAction.targets || [];
                }
            }
        }

        const targetGrid = document.createElement('div');
        targetGrid.className = 'target-grid';

        const footer = document.createElement('div');
        footer.className = 'panel-footer';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = `Xác nhận ${actionDetails.title}`;
        confirmBtn.disabled = true;
        footer.appendChild(confirmBtn);

        const wolfVotes = (roomData.nightActions && roomData.nightActions[currentNight] && roomData.nightActions[currentNight].wolf_group) ? roomData.nightActions[currentNight].wolf_group.votes || {} : {};
        const voteCounts = Object.values(wolfVotes).reduce((acc, targetId) => {
            acc[targetId] = (acc[targetId] || 0) + 1;
            return acc;
        }, {});

        targetPlayers.forEach(([id, player]) => {
            const card = document.createElement('div');
            card.className = 'target-card';
            card.dataset.playerId = id;

            let playerName = player.name;
            if (myPlayerId === id) playerName += ' (Bạn)';

            card.innerHTML = `<p class="player-name">${playerName}</p>`;

            if (previousTargetIds.includes(id)) {
                card.classList.add('disabled');
                card.title = "Không thể chọn mục tiêu này 2 đêm liên tiếp";
            }

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

        const allCards = targetGrid.querySelectorAll('.target-card');
        targetGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.target-card');
            if (!card || card.classList.contains('disabled')) return;

            const isMultiSelect = targetLimit > 1;
            if (isMultiSelect) {
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

        confirmBtn.addEventListener('click', () => {
            const selectedTargets = Array.from(targetGrid.querySelectorAll('.selected')).map(c => c.dataset.playerId);
            if (selectedTargets.length === 0) return;

            const actionPath = actionDetails.isWolfGroupAction ?
                `rooms/${currentRoomId}/nightActions/${currentNight}/wolf_group` :
                `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;

            if (actionDetails.isWolfGroupAction) {
                const updates = {};
                updates[`${actionPath}/votes/${myPlayerId}`] = selectedTargets[0];
                database.ref().update(updates);
            } else {
                database.ref(actionPath).set({
                    action: actionDetails.actionKey,
                    targets: selectedTargets
                });
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
            database.ref(`rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`).set({
                action: 'wizard_save',
                targets: []
            });
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

    function handleWolfActionChoice(choice) {
        const currentNight = roomData.interactiveState.currentNight;
        const actionPath = `rooms/${currentRoomId}/nightActions/${currentNight}/wolf_group/action`;
        database.ref(actionPath).set(choice);
        wolfActionChoiceModal.classList.add('hidden');
    }

// Tệp: player.js

    function handleReturningSpiritState(state) {
        const myProgress = state.playerProgress[myPlayerId];
        if (!myProgress) return; // Không tham gia

        const doorA = spiritDoorOptions.querySelector('[data-choice="A"]');
        const doorB = spiritDoorOptions.querySelector('[data-choice="B"]');

        // Vô hiệu hóa các nút trước khi cập nhật
        doorA.disabled = true;
        doorB.disabled = true;

        if (myProgress.isWinner) {
            spiritRoundDisplay.textContent = "CHIẾN THẮNG!";
            spiritStatusMessage.textContent = "Bạn đã vượt qua tất cả các cửa và trở thành người chiến thắng!";
            spiritDoorOptions.classList.add('hidden');
            return;
        }

        if (myProgress.isEliminated) {
            spiritRoundDisplay.textContent = "ĐÃ BỊ LOẠI";
            spiritStatusMessage.textContent = `Bạn đã chọn sai ở vòng ${myProgress.currentRound}.`;
            spiritDoorOptions.classList.add('hidden');
            return;
        }

        // Nếu chưa bị loại hoặc thắng, hiển thị vòng hiện tại
        spiritDoorOptions.classList.remove('hidden');
        spiritRoundDisplay.textContent = `Vòng ${myProgress.currentRound}`;
        spiritStatusMessage.textContent = "Hãy đưa ra lựa chọn của bạn...";
        
        // Mở lại các nút
        doorA.disabled = false;
        doorB.disabled = false;

        // Xử lý khi click chọn cửa
        const handleChoice = (choice) => {
            // Khóa các nút lại ngay sau khi chọn
            doorA.disabled = true;
            doorB.disabled = true;
            spiritStatusMessage.textContent = "Đang kiểm tra...";

            const correctChoice = state.correctPath[myProgress.currentRound - 1];
            const isCorrect = (choice === correctChoice);
            
            const updates = {};
            const basePath = `rooms/${currentRoomId}/minigameState/playerProgress/${myPlayerId}`;
            
            // ================= SỬA LỖI =================
            // Sử dụng `(myProgress.choices || [])` để đảm bảo luôn là một mảng có thể trải được
            const newChoices = [...(myProgress.choices || []), choice];

            if (isCorrect) {
                const nextRound = myProgress.currentRound + 1;
                updates[`${basePath}/choices`] = newChoices;
                updates[`${basePath}/currentRound`] = nextRound;

                if (nextRound > 3) { // Thắng
                    updates[`${basePath}/isWinner`] = true;
                    // Chỉ người chơi đầu tiên thắng mới cập nhật được `winner`
                    database.ref(`rooms/${currentRoomId}/minigameState/winner`).once('value', snapshot => {
                        if (!snapshot.exists()) {
                            database.ref(`rooms/${currentRoomId}/minigameState/winner`).set(myPlayerId);
                        }
                    });
                }
            } else { // Thua
                updates[`${basePath}/choices`] = newChoices;
                updates[`${basePath}/isEliminated`] = true;
            }
            // ================= KẾT THÚC SỬA LỖI =================

            database.ref().update(updates);
        };

        // Gán lại event listeners để tránh bị trùng lặp
        doorA.onclick = () => handleChoice('A');
        doorB.onclick = () => handleChoice('B');
    }

    // --- EVENT LISTENERS ---
    const eventListeners = [{
        el: loginBtn,
        event: 'click',
        handler: handleLogin
    }, {
        el: passwordInput,
        event: 'keyup',
        handler: (e) => {
            if (e.key === 'Enter') loginBtn.click();
        }
    }, {
        el: roleRevealSection,
        event: 'click',
        handler: () => roleRevealSection.classList.toggle('is-flipped')
    }, {
        el: randomChoiceBtn,
        event: 'click',
        handler: () => {
            if (currentRoomId) {
                const username = sessionStorage.getItem('mywolf_username');
                if (username) selectRole(username, currentRoomId, 'random');
            }
        }
    }, {
        el: roleDescriptionModal,
        event: 'click',
        handler: (e) => {
            if (e.target === roleDescriptionModal || e.target.classList.contains('close-modal-btn')) {
                roleDescriptionModal.classList.add('hidden');
            }
        }
    }, {
        el: openWillModalBtn,
        event: 'click',
        handler: openWillModal
    }, {
        el: willTextarea,
        event: 'input',
        handler: updateWordCount
    }, {
        el: saveWillBtn,
        event: 'click',
        handler: saveWill
    }];
    eventListeners.forEach(({
        el,
        event,
        handler
    }) => {
        if (el) el.addEventListener(event, handler);
    });

    [willWritingModal, publishedWillModal, assassinModal, wolfActionChoiceModal, document.getElementById('announcement-modal')].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('close-modal-btn')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });

    const wolfBiteBtn = document.getElementById('wolf-choice-bite-btn');
    if (wolfBiteBtn) {
        wolfBiteBtn.addEventListener('click', () => handleWolfActionChoice('kill'));
    }
    
    const wolfCurseBtn = document.getElementById('wolf-choice-curse-btn');
    if (wolfCurseBtn) {
        wolfCurseBtn.addEventListener('click', () => handleWolfActionChoice('curse'));
    }


    // === BẮT ĐẦU: EVENT LISTENER CHO MINI GAME ===
    if (minigameConfirmBtn) {
        minigameConfirmBtn.addEventListener('click', () => {
            const currentMinigameOptions = document.getElementById('minigame-options-container');
            const selectedNodes = currentMinigameOptions.querySelectorAll('.selected');
            if (selectedNodes.length !== 2) {
                minigameStatusMessage.textContent = "Vui lòng chọn đúng 2 người chơi.";
                return;
            }

            const selectedIds = Array.from(selectedNodes).map(node => node.dataset.targetId);
            const choiceRef = database.ref(`rooms/${currentRoomId}/minigameState/choices/${myPlayerId}`);

            choiceRef.set(selectedIds).catch(err => {
                minigameStatusMessage.textContent = "Lỗi khi gửi lựa chọn: " + err.message;
            });
        });
    }
    // === KẾT THÚC: EVENT LISTENER CHO MINI GAME ===


    // --- INITIAL LOAD ---
    const initialize = async () => {
        await fetchAllRolesData();
        await fetchNightQuotes();
        checkSessionAndAutoLogin();
    };

    initialize();
});