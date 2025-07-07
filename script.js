document.addEventListener('DOMContentLoaded', function() {
  // Lấy các phần tử DOM
  const loginButton = document.getElementById('loginButton');
  const adminButton = document.getElementById('adminButton');
  const playerPassword = document.getElementById('playerPassword');
  const adminPassword = document.getElementById('adminPassword');

  // Xử lý đăng nhập người chơi
  loginButton.addEventListener('click', function() {
    const password = playerPassword.value;
    if (password) {
      // Gọi API đăng nhập
      fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password, type: 'player' })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.username) {
          // *** THAY ĐỔI QUAN TRỌNG ***
          // Lưu tên người dùng vào session storage trước khi chuyển hướng
          sessionStorage.setItem('mywolf_username', data.username);
          
          // Chuyển hướng đến trang người chơi
          window.location.href = 'player.html';
        } else {
          alert(data.message || 'Mật khẩu không chính xác!');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Có lỗi xảy ra khi đăng nhập!');
      });
    } else {
      alert('Vui lòng nhập mật khẩu!');
    }
  });

  // Xử lý đăng nhập quản trò (giữ nguyên)
  adminButton.addEventListener('click', function() {
    const password = adminPassword.value;
    if (password) {
      // Gọi API đăng nhập quản trò
      fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password, type: 'admin' })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // Chuyển hướng đến trang quản trị
          window.location.href = 'admin.html';
        } else {
          alert('Mật khẩu quản trò không chính xác!');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Có lỗi xảy ra khi đăng nhập!');
      });
    } else {
      alert('Vui lòng nhập mật khẩu quản trò!');
    }
  });

  // Xử lý khi nhấn Enter trong ô input (giữ nguyên)
  playerPassword.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      loginButton.click();
    }
  });

  adminPassword.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      adminButton.click();
    }
  });
});