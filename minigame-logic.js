// =================================================================
// === minigame-logic.js - Module quản lý Mini Game (Đã nâng cấp) ===
// =================================================================

class MinigameManager {
    constructor(database, roomId, getRoomPlayers, getNightStates) {
        this.database = database;
        this.roomId = roomId;
        this.getRoomPlayers = getRoomPlayers; // Hàm để lấy danh sách người chơi hiện tại
        this.getNightStates = getNightStates; // Hàm để lấy trạng thái các đêm

        // Lấy các DOM elements
        this.minigameSection = document.getElementById('minigame-section');
        this.minigameSelect = document.getElementById('minigame-select');
        this.startMinigameBtn = document.getElementById('start-minigame-btn');
        this.endMinigameBtn = document.getElementById('end-minigame-btn');
        this.minigameResultsContainer = document.getElementById('minigame-results-container');
        this.minigameResultsDetails = document.getElementById('minigame-results-details');
        this.minigameLiveChoices = document.getElementById('minigame-live-choices');
        this.minigameLiveChoicesList = document.getElementById('minigame-live-choices-list');

        this.attachEventListeners();
        this.listenForStateChanges();
    }

    attachEventListeners() {
        if (this.startMinigameBtn) this.startMinigameBtn.addEventListener('click', () => this.handleStartMinigame());
        if (this.endMinigameBtn) this.endMinigameBtn.addEventListener('click', () => this.handleEndMinigame());
    }

    listenForStateChanges() {
        this.database.ref(`rooms/${this.roomId}/minigameState`).on('value', (snapshot) => {
            const state = snapshot.val();
            if (!this.minigameSection) return;

            if (!state || state.status === 'inactive') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.endMinigameBtn.style.display = 'none';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = false;
                this.minigameLiveChoices.style.display = 'none';
            } else if (state.status === 'active') {
                this.startMinigameBtn.style.display = 'none';
                this.endMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = true;
                this.minigameLiveChoices.style.display = 'block';
                this.renderLiveChoices(state);
            } else if (state.status === 'finished') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.endMinigameBtn.style.display = 'none';
                this.minigameResultsContainer.style.display = 'block';
                this.minigameSelect.disabled = false;
                this.minigameLiveChoices.style.display = 'none';
                this.renderResults(state);
            }
        });
    }

    renderLiveChoices(state) {
        if (!this.minigameLiveChoicesList) return;
        this.minigameLiveChoicesList.innerHTML = '';
        
        const participants = state.participants || {};

        if (state.gameType === 'night_of_trust') {
            const choices = state.choices || {};
            for (const playerId in participants) {
                const playerName = participants[playerId];
                const playerChoice = choices[playerId];
                let choiceText = '<em>Đang chờ...</em>';

                if (Array.isArray(playerChoice) && playerChoice.length > 0) {
                    const chosenNames = playerChoice.map(id => participants[id] || 'N/A').join(', ');
                    choiceText = `đã chọn: <strong>${chosenNames}</strong>`;
                }

                const li = document.createElement('li');
                li.innerHTML = `${playerName} ${choiceText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        } else if (state.gameType === 'math_whiz') {
            const submissions = state.submissions || {};
            for (const playerId in participants) {
                const playerName = participants[playerId];
                const submission = submissions[playerId];
                let statusText = '<em>Chưa trả lời...</em>';

                if (submission) {
                    const timeTaken = ((submission.timestamp - state.startTime) / 1000).toFixed(2);
                    statusText = `đã trả lời (Đáp án: ${submission.answer}) - <strong>${timeTaken}s</strong>`;
                }
                const li = document.createElement('li');
                li.innerHTML = `${playerName} ${statusText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        }
    }

    renderResults(state) {
        let resultsHTML = '';
        if (!state.results) {
            this.minigameResultsDetails.innerHTML = "<p>Không có kết quả.</p>";
            return;
        }

        if (state.gameType === 'night_of_trust') {
            resultsHTML = '<ul>';
            const { trustCounts, deadPlayerNames } = state.results;
            if (trustCounts && state.participants) {
                for (const pId in state.participants) {
                    const name = state.participants[pId];
                    const count = trustCounts[pId] || 0;
                    const isDead = deadPlayerNames.includes(name);
                    resultsHTML += `<li style="${isDead ? 'color: var(--danger-color); text-decoration: line-through;' : ''}">
                        <strong>${name}:</strong> ${count} phiếu tin tưởng
                    </li>`;
                }
            }
            resultsHTML += '</ul>';
        } else if (state.gameType === 'math_whiz') {
            const { winnerName, timeToAnswer, problem } = state.results;
            resultsHTML = `<p><strong>Câu hỏi:</strong> ${problem.question} = ${problem.correctAnswer}</p>`;
            if (winnerName) {
                resultsHTML += `<p>🏆 <strong>Người thắng cuộc:</strong> ${winnerName} (Trả lời trong ${timeToAnswer.toFixed(2)}s)</p>`;
            } else {
                resultsHTML += `<p> Rất tiếc, không có ai trả lời đúng.</p>`;
            }
        }
        
        this.minigameResultsDetails.innerHTML = resultsHTML;
    }

    handleStartMinigame() {
        const nightStates = this.getNightStates();
        const roomPlayers = this.getRoomPlayers();
        const lastNight = nightStates[nightStates.length - 1];

        if (!lastNight) {
            alert("Chưa có đêm nào bắt đầu!");
            return;
        }
        const { finalStatus } = calculateNightStatus(lastNight, roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);

        if (livingPlayers.length < 1) {
            alert("Cần ít nhất 1 người chơi còn sống để bắt đầu mini game.");
            return;
        }

        const participants = livingPlayers.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {});

        const gameType = this.minigameSelect.value;
        let newMinigameState = {
            status: 'active',
            gameType,
            participants,
            startTime: firebase.database.ServerValue.TIMESTAMP,
            choices: null,
            submissions: null,
            results: null
        };

        if (gameType === 'night_of_trust') {
            if (livingPlayers.length < 3) {
                 alert("Cần ít nhất 3 người chơi còn sống để bắt đầu mini game này.");
                 return;
            }
            newMinigameState.title = "Mini Game: Đêm của Lòng Tin";
        } else if (gameType === 'math_whiz') {
            newMinigameState.title = "Mini Game: Thần Đồng Toán Học";
            newMinigameState.endTime = Date.now() + 10000; // 10 giây
            newMinigameState.problem = this.generateMathProblem();
        }

        this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
    }

    generateMathProblem() {
        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let num1, num2, correctAnswer;

        if (op === '+') {
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * 50) + 1;
            correctAnswer = num1 + num2;
        } else if (op === '-') {
            num1 = Math.floor(Math.random() * 50) + 20;
            num2 = Math.floor(Math.random() * 20) + 1;
            correctAnswer = num1 - num2;
        } else { // op === '*'
            num1 = Math.floor(Math.random() * 9) + 2;
            num2 = Math.floor(Math.random() * 9) + 2;
            correctAnswer = num1 * num2;
        }

        const answers = new Set([correctAnswer]);
        while (answers.size < 3) {
            const offset = Math.floor(Math.random() * 10) + 1;
            const wrongAnswer = correctAnswer + (Math.random() > 0.5 ? offset : -offset);
            if (wrongAnswer !== correctAnswer) {
                answers.add(wrongAnswer);
            }
        }
        
        const shuffledAnswers = Array.from(answers).sort(() => Math.random() - 0.5);

        return {
            question: `${num1} ${op} ${num2}`,
            answers: shuffledAnswers,
            correctAnswer: correctAnswer
        };
    }
    
    async handleEndMinigame() {
        this.endMinigameBtn.disabled = true;
        this.endMinigameBtn.textContent = "Đang xử lý...";

        const minigameStateRef = this.database.ref(`rooms/${this.roomId}/minigameState`);
        const snapshot = await minigameStateRef.once('value');
        const currentState = snapshot.val();

        if (!currentState || currentState.status !== 'active') {
            alert("Mini game chưa được bắt đầu hoặc đã kết thúc.");
            this.endMinigameBtn.disabled = false;
            this.endMinigameBtn.textContent = "Kết Thúc & Xử Lý";
            return;
        }

        let announcementText = "";
        const updates = {};
        updates[`/minigameState/status`] = 'finished';

        if (currentState.gameType === 'night_of_trust') {
            const choices = currentState.choices || {};
            const participants = currentState.participants || {};
            const trustCounts = {};
            Object.keys(participants).forEach(pId => { trustCounts[pId] = 0; });

            Object.values(choices).forEach(trustedArray => {
                if (Array.isArray(trustedArray)) {
                    trustedArray.forEach(id => { if (trustCounts.hasOwnProperty(id)) trustCounts[id]++; });
                }
            });

            const deadPlayerIds = Object.keys(trustCounts).filter(id => trustCounts[id] === 0);
            const deadPlayerNames = deadPlayerIds.map(id => participants[id]);

            deadPlayerIds.forEach(id => {
                updates[`/players/${id}/isAlive`] = false;
            });
            
            const nightStates = this.getNightStates();
            if (nightStates.length > 0) {
                const lastNightState = nightStates[nightStates.length - 1];
                deadPlayerIds.forEach(id => {
                    if (lastNightState.playersStatus[id]) {
                        lastNightState.playersStatus[id].isAlive = false;
                    }
                });
                await this.database.ref(`rooms/${this.roomId}/nightNotes`).set(nightStates);
            }
            
            announcementText = `Mini game "Đêm của Lòng Tin" đã kết thúc. ${deadPlayerNames.length > 0 ? `Người không nhận được sự tin tưởng và phải chết là: ${deadPlayerNames.join(', ')}.` : 'Tất cả mọi người đều an toàn.'}`;
            updates[`/minigameState/results`] = { trustCounts, deadPlayerNames };
            alert(`Mini game kết thúc! Người chết: ${deadPlayerNames.join(', ') || 'Không có ai'}.`);
        
        } else if (currentState.gameType === 'math_whiz') {
            const submissions = currentState.submissions || {};
            const { correctAnswer } = currentState.problem;

            const correctSubmissions = Object.entries(submissions)
                .filter(([, sub]) => sub.answer == correctAnswer)
                .sort(([, a], [, b]) => a.timestamp - b.timestamp);

            if (correctSubmissions.length > 0) {
                const [winnerId, winnerSubmission] = correctSubmissions[0];
                const winnerName = currentState.participants[winnerId];
                const timeToAnswer = (winnerSubmission.timestamp - currentState.startTime) / 1000;
                
                announcementText = `Mini game "Thần Đồng Toán Học" đã kết thúc. Chúc mừng ${winnerName} đã trả lời đúng và nhanh nhất!`;
                updates[`/minigameState/results`] = { 
                    winnerId, 
                    winnerName, 
                    timeToAnswer,
                    problem: currentState.problem,
                    allSubmissions: submissions
                };
                 alert(`Mini game kết thúc! Người thắng cuộc: ${winnerName}.`);
            } else {
                announcementText = `Mini game "Thần Đồng Toán Học" đã kết thúc. Rất tiếc, không có ai trả lời đúng.`;
                updates[`/minigameState/results`] = { 
                    winnerName: null, 
                    problem: currentState.problem,
                    allSubmissions: submissions
                };
                alert(`Mini game kết thúc! Không có ai thắng.`);
            }
        }
        
        updates['/publicData/latestAnnouncement'] = {
            message: announcementText,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.database.ref(`rooms/${this.roomId}`).update(updates);

        this.endMinigameBtn.disabled = false;
        this.endMinigameBtn.textContent = "Kết Thúc & Xử Lý";
    }
}