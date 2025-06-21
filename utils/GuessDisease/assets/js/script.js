/*
 * @Description: 
 * @Author: DSTBP
 * @Date: 2025-04-13 13:09:37
 * @LastEditTime: 2025-04-13 13:49:01
 * @LastEditors: DSTBP
 */
let chatId = '';
let isConversationStarted = false;

const headers = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'fun-device': 'web',
    'referer': 'https://xiaoce.fun/guessdisease',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
};

// 格式化日期为YYYYMMDD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 设置日期选择器的默认值和最大值
function initDatePicker() {
    const dateInput = document.getElementById('dateInput');
    const today = new Date();
    const minDate = new Date('2022-01-01');
    
    dateInput.value = formatDate(today).slice(0, 4) + '-' + formatDate(today).slice(4, 6) + '-' + formatDate(today).slice(6, 8);
    dateInput.max = formatDate(today).slice(0, 4) + '-' + formatDate(today).slice(4, 6) + '-' + formatDate(today).slice(6, 8);
}

// 锁定日期选择器
function lockDatePicker() {
    const dateInput = document.getElementById('dateInput');
    dateInput.disabled = true;
    dateInput.style.opacity = '0.7';
    dateInput.style.cursor = 'not-allowed';
}

function showCelebration() {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    
    // 创建消息框
    const message = document.createElement('div');
    message.className = 'celebration-message';
    message.textContent = '恭喜！诊断正确！';
    
    // 添加点击事件，点击任意位置关闭弹窗
    overlay.addEventListener('click', () => {
        overlay.remove();
    });
    
    // 防止点击消息框时关闭弹窗
    message.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    overlay.appendChild(message);
    document.body.appendChild(overlay);

    // 3秒后自动关闭
    setTimeout(() => {
        if (document.body.contains(overlay)) {
            overlay.remove();
        }
    }, 3000);
}

async function sendMessage(message) {
    const dateInput = document.getElementById('dateInput');
    const selectedDate = new Date(dateInput.value);
    const formattedDate = formatDate(selectedDate);

    // 如果是第一次发送消息，锁定日期选择器
    if (!isConversationStarted) {
        isConversationStarted = true;
        lockDatePicker();
    }

    const params = new URLSearchParams({
        'date': formattedDate,
        'chatId': chatId,
        'message': message
    });

    try {
        const response = await fetch(`https://xiaoce.fun/api/v0/quiz/daily/guessDisease/sendMessage?${params}`, {
            headers: headers
        });
        const data = await response.json();
        
        if (data.success) {
            chatId = data.data.chatId;
            if (data.data.right) {
                showCelebration();
            }
            return data.data.answer;
        } else {
            throw new Error('API请求失败');
        }
    } catch (error) {
        console.error('Error:', error);
        return '抱歉，系统出现错误，请稍后再试。';
    }
}

function addMessage(content, isUser = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = content;
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 初始化日期选择器
initDatePicker();

document.getElementById('sendButton').addEventListener('click', async () => {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    
    if (message) {
        // 添加用户消息
        addMessage(message, true);
        userInput.value = '';
        
        // 发送消息并获取回复
        const response = await sendMessage(message);
        addMessage(response);
    }
});

// 按回车键发送消息
document.getElementById('userInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('sendButton').click();
    }
}); 