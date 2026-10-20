# Adaptive Keyboard

基于浏览器的 MIDI 键盘工具：通过摄像头追踪双手位置，动态调整左右手的音色分区；也可用于实时和弦识别与演奏可视化。

## 在线使用

**无需安装，直接打开网页：**

- **[打开 Adaptive Keyboard（Hand Split）](https://tigerpan119.github.io/adaptive-keyboard/)**
- **[打开 Chord Theory（和弦识别）](https://tigerpan119.github.io/adaptive-keyboard/chord-theory.html)**

页面顶部可以在 **Hand Split** 和 **Chord Theory** 之间切换。

## 使用前准备

- 建议使用电脑上的 Chrome 或 Edge 浏览器。
- 使用实体键盘时，将支持 MIDI 的电子琴或 MIDI 控制器连接到电脑，并允许网页访问 MIDI 设备。
- 使用 Hand Split 时，需要一个能拍到完整琴键和双手的摄像头，并允许网页使用摄像头。
- 如需浏览器发声，准备一个本地 SoundFont 音色文件，例如 `.sf2`。

> **在线版本没有附带默认音色文件。** 原项目的 `undertale.sf2` 约 154 MB，超过 GitHub 普通文件的大小限制，因此未上传。如果看到默认音色加载失败，请通过 **Choose or drop SoundFont** 手动选择文件；这不表示网站部署失败。

## Hand Split：让双手使用不同音色

1. 打开 [Hand Split 页面](https://tigerpan119.github.io/adaptive-keyboard/)。
2. 点击 **Start camera**，允许摄像头访问。需要切换摄像头时，在 **Camera** 中选择设备。
3. 调整摄像头，让画面包含完整琴键和双手，保持光线充足。
4. 校准键盘位置：尝试 **Auto detect edges**，或分别点击 **Set left edge**、**Set right edge**，再点击画面中的对应琴键边缘。
5. 在 **Keyboard range** 中设置实际键盘的最低音和最高音。标准 88 键钢琴为 **A0–C8**；也可以使用 49、61 键预设，并按实际设备调整。
6. 在 **MIDI input** 中选择键盘。如果连接后没有出现设备，点击旁边的刷新按钮，并检查 MIDI 权限。
7. 在 **SoundFont** 中点击 **Choose or drop SoundFont**，或将音色文件拖入页面。
8. 加载完成后，分别选择 **Left sound** 和 **Right sound**，并调整音量。
9. 开始演奏。画面中的蓝色区域对应左侧音色，红色区域对应右侧音色；分割位置会随手部追踪结果变化。

**调节建议：**

- **Split anchor → Palm / Thumbs**：切换分割点计算使用的手部位置。Palm 通常更稳定，Thumbs 更接近拇指触及的位置。
- **Performance mode**：减少追踪和界面更新的负担，适合出现卡顿时尝试。
- **Diagnostics**：查看手部追踪、MIDI、音频和音符路由状态。

摄像头用于追踪手部位置，实际音符来自 MIDI 输入。尚未追踪到双手时，程序会使用键盘音域的中点作为备用分割位置。遮挡、光线不足和双手交叉可能影响追踪效果。

## Chord Theory：识别和弦与可视化

1. 打开 [Chord Theory 页面](https://tigerpan119.github.io/adaptive-keyboard/chord-theory.html)。
2. 连接 MIDI 键盘，并在 **MIDI input** 中选择设备。
3. 同时按下多个音，查看和弦名称、音符及屏幕键盘上的标记。
4. 如需浏览器发声，开启 **SoundFont audio**，通过 **Choose or drop SoundFont** 加载本地音色，再在 **Sound** 中选择音色。
5. 在 **Recognition → Note spelling** 中选择 **Sharps** 或 **Flats**，切换升号或降号显示。
6. 在 **Visualization** 中调整音符轨迹、颜色和背景等显示效果。

**没有 MIDI 键盘也可以体验：** 点击页面中的屏幕琴键；按住电脑键盘上的 **Q** 可延长音符，方便逐个点击组成和弦。识别和弦本身不需要开启摄像头或加载音色。

### 播放 MIDI 文件

在 **Autoplay** 中开启 **Autoplay mode**，通过 **Choose or drop MIDI** 选择 `.mid` 或 `.midi` 文件，选择 **MIDI output**，然后使用播放控件开始播放。该功能面向外部 MIDI 乐器输出；要听到外部乐器的声音，需要设备本身或相应音源负责发声。

## 常见问题

### 没有声音

- Hand Split：确认已加载 SoundFont，并选择左右手音色。
- Chord Theory：确认已开启 **SoundFont audio**、加载 SoundFont，并选择音色。
- 检查网页音量、系统输出设备和浏览器标签页是否静音。
- 点击页面或琴键后重试，让浏览器允许音频播放。
- 使用外部 MIDI 输出时，检查外部设备或软件音源的音频输出。

### 找不到 MIDI 设备

- 确认设备已开机、连接正常，并支持 MIDI。
- 允许网站的 MIDI 权限，再点击 **Refresh MIDI** 或重新加载页面。
- 尝试关闭可能占用设备的其他音乐软件。
- 如果提示 **Web MIDI unsupported**，请尝试电脑上的 Chrome 或 Edge。

### 摄像头无法启动或追踪不稳定

- 检查浏览器和操作系统中的摄像头权限。
- 关闭可能占用摄像头的其他应用，并确认选择了正确的 Camera。
- 增加光线，减少手部遮挡，确保完整琴键在画面中，并重新校准。

### 默认 SoundFont 加载失败

这是当前在线版本的已知情况：仓库未包含 `assets/undertale.sf2`。请手动选择本地 SoundFont。页面支持选择 SF2、SF3、DLS、SFOGG、SFONT 文件；建议先用已知可用的 SF2 测试。

### 页面首次加载较慢

手部追踪、音色引擎和部分界面依赖通过外部 CDN 加载，请保持联网。如果加载失败，可检查网络后刷新页面。

## 本地运行（可选）

项目为静态网页，无需构建。安装 Node.js 后，在项目目录运行：

```sh
node server.js
```

然后打开：

- Hand Split：<http://127.0.0.1:5173/>
- Chord Theory：<http://127.0.0.1:5173/chord-theory.html>

如需本地自动加载默认音色，将自己的 `undertale.sf2` 放到 `assets/` 目录。该文件已被 Git 忽略。

## 项目结构

- `index.html`：Hand Split 页面。
- `chord-theory.html`：Chord Theory 页面。
- `src/js/`：手部追踪、校准、MIDI、音频和界面逻辑。
- `src/js/chord-theory/`：和弦识别、可视化及练习相关模块。
- `src/styles/`：页面样式。
- `tests/`：测试脚本。
- `server.js`：本地静态文件服务器。

网站通过 GitHub Pages 从 `main` 分支根目录发布，更新该分支后会自动重新部署。
