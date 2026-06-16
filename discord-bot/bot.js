import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Tải biến môi trường
dotenv.config();
// Cố gắng tìm biến môi trường ở thư mục cha nếu không có trong thư mục hiện tại
if (!process.env.GAS_WEB_APP_URL && !process.env.VITE_GAS_WEB_APP_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL || process.env.VITE_GAS_WEB_APP_URL;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN không được tìm thấy trong file .env');
}
if (!GAS_WEB_APP_URL) {
  console.warn('⚠️ GAS_WEB_APP_URL không được tìm thấy. Vui lòng thiết lập biến môi trường.');
}

const DB_FILE = './db.json';

// Đọc cơ sở dữ liệu mapping người dùng Discord -> Email
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Lỗi đọc database db.json:', e);
  }
  return {};
}

// Ghi cơ sở dữ liệu mapping người dùng Discord -> Email
function writeDb(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi ghi database db.json:', e);
  }
}

// Khởi tạo client bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, // Hỗ trợ Direct Messages (DM)
  ],
  partials: [Partials.Channel] // Yêu cầu để nhận diện tin nhắn trong DM ở v14
});

client.once('clientReady', () => {
  console.log(`🤖 Bot Discord đã online! Đăng nhập thành công: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Bỏ qua tin nhắn từ chính bot hoặc các bot khác
  if (message.author.bot) return;

  const content = message.content ? message.content.trim() : '';
  const location = message.guild ? `Server: ${message.guild.name}` : 'DM (Tin nhắn riêng)';
  
  console.log(`📩 Nhận tin nhắn từ ${message.author.tag} (${location}): "${content}"`);

  if (!content) {
    console.warn(`⚠️ Nội dung tin nhắn trống. Nếu bạn đang gõ lệnh mà bot nhận được chuỗi trống, vui lòng kiểm tra xem bạn đã bật "Message Content Intent" trong Discord Developer Portal chưa.`);
    return;
  }

  // Làm sạch tin nhắn (bỏ dấu gạch chéo / nếu có ở đầu)
  let cleanContent = content;
  if (cleanContent.startsWith('/')) {
    cleanContent = cleanContent.slice(1).trim();
  }

  const parts = cleanContent.split(/\s+/);
  const command = parts[0].toLowerCase();

  // Danh sách các lệnh hợp lệ (không bao gồm dấu /) để nhận diện và forward
  const validGasCommands = [
    'do', 'khomau', 'hp', 'change', 'today', 'upcoming', 'me', 'top', 'bet',
    'bk', 'ck', 'vd', 'vđ', 'vpl'
  ];

  const isLocalCommand = command === 'link' || command === 'dangky' || command === 'register';
  const isSpecialCommand = command.startsWith('#');
  const isDateCommand = /^\d{1,2}\/\d{1,2}$/.test(command);
  const isGasCommand = validGasCommands.includes(command);

  // Nếu tin nhắn không phải là lệnh của bot, bỏ qua để tránh spam trong server
  if (!isLocalCommand && !isSpecialCommand && !isDateCommand && !isGasCommand) {
    return;
  }

  // 1. Lệnh liên kết: link hoặc dangky hoặc register
  if (isLocalCommand) {
    const email = parts.length > 1 ? parts[1].trim() : '';
    
    // Kiểm tra định dạng email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return message.reply('❌ Vui lòng nhập đúng địa chỉ email của bạn!\nCú pháp: `link <email_của_bạn>`\nVí dụ: `link hoangtuan@gmail.com`');
    }

    try {
      await message.channel.sendTyping();

      // Gọi API registerUser trên Google Apps Script để đăng ký/cập nhật user
      const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'registerUser',
          data: {
            email: email,
            displayName: displayName
          }
        })
      });

      const resJson = await response.json();
      if (resJson.success) {
        const db = readDb();
        const discordId = message.author.id;
        db[discordId] = {
          email: email,
          displayName: displayName
        };
        writeDb(db);

        return message.reply(`✅ **Liên kết tài khoản thành công!**\n• Discord: <@${discordId}>\n• Email: \`${email}\`\n• Tên hiển thị: \`${displayName}\`\n\n${resJson.message}`);
      } else {
        return message.reply(`❌ **Không thể liên kết tài khoản:** Máy chủ báo lỗi: ${resJson.message}`);
      }
    } catch (error) {
      console.error('Lỗi gọi API GAS registerUser:', error);
      return message.reply(`⚠️ **Không thể liên kết tài khoản:** Không thể kết nối tới Google Sheets: ${error.message}`);
    }
  }

  // 2. Đối với các lệnh tương tác khác: kiểm tra liên kết email trước nếu không phải là lệnh công cộng
  const db = readDb();
  const discordId = message.author.id;
  const mappedUser = db[discordId];

  // Các lệnh công cộng không yêu cầu liên kết email trước
  const publicCommands = ['today', 'upcoming', 'top'];
  const isPublicCommand = publicCommands.includes(command) || isSpecialCommand || isDateCommand;

  if (!mappedUser && !isPublicCommand) {
    return message.reply(`⚠️ Tài khoản Discord của bạn chưa được liên kết với email của ứng dụng.\nVui lòng sử dụng lệnh:\n\`link <email của bạn>\` để liên kết trước (Ví dụ: \`link hoangtuan@gmail.com\`).`);
  }

  // Forward lệnh trực tiếp sang hàm processCommand trên Google Sheets
  try {
    await message.channel.sendTyping();

    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'processCommand',
        data: {
          message: cleanContent,
          email: mappedUser ? mappedUser.email : '',
          displayName: mappedUser ? mappedUser.displayName : message.author.username
        }
      })
    });

    const resJson = await response.json();
    let replyMsg = resJson.message || 'Không nhận được phản hồi từ hệ thống.';
    
    // Giới hạn độ dài tin nhắn của Discord là 2000 ký tự
    if (replyMsg.length > 2000) {
      replyMsg = replyMsg.substring(0, 1990) + '... (bị cắt bớt do giới hạn ký tự Discord)';
    }

    return message.reply(replyMsg);

  } catch (error) {
    console.error('Lỗi khi gọi API GAS processCommand:', error);
    return message.reply(`❌ **Không thể kết nối đến máy chủ Google Sheets:**\n${error.message}`);
  }
});

client.login(DISCORD_TOKEN);
