/* =========================================================
   礼物内容 —— 地点、你写给妈妈的话、你放进去的照片
   想改文字，直接改这里；照片放进 photos/ 文件夹后，在 GIFT_PHOTOS 里登记
   ========================================================= */

window.GIFT = {
  title: '妈妈，你已经走了这么远',
  subtitle: "A Map of the Life You've Built",

  // 默认的四个地方（妈妈之后还可以自己添加新的地方）
  places: [
    { id: 'zz', city: '郑州', en: 'Zhengzhou', region: '河南 · 中国', coord: [113.63, 34.75], year: '',
      note: '我记得你说起郑州的时候，语气总会慢下来，好像那里的时间走得比别处慢一点。' },
    { id: 'sh', city: '上海', en: 'Shanghai', region: '中国', coord: [121.47, 31.23], year: '',
      note: '我记得你讲上海的时候，总说那时候有多忙，可是讲着讲着就笑了。' },
    { id: 'to', city: '多伦多', en: 'Toronto', region: '安大略 · 加拿大', coord: [-79.38, 43.65], year: '',
      note: '我记得第一场大雪的时候，你在窗边站了很久，说：“原来这里的雪是这样的。”' },
    { id: 'ca', city: '加州', en: 'California', region: '美国', coord: [-119.4, 36.8], year: '',
      note: '我记得在海边，你难得什么都没安排，只是坐着看海。' }
  ],

  // 你放进去的照片：{ place: 地点id, src: 'photos/文件名.jpg', coord: [经度, 纬度], caption: '说明', date: '2019-07' }
  // coord 不写就放在地点中心附近。sample: true 的是示例图，放入真实照片后删掉即可。
  photos: [
    { place: 'zz', art: 'zz', coord: [113.66, 34.80], caption: '郑州 · 示例', sample: true },
    { place: 'zz', art: 'zz2', coord: [113.70, 34.89], caption: '黄河边 · 示例', sample: true },
    { place: 'zz', art: 'zz', coord: [114.35, 34.79], caption: '开封 · 示例', sample: true },
    { place: 'sh', art: 'sh', coord: [121.49, 31.24], caption: '外滩 · 示例', sample: true },
    { place: 'sh', art: 'sh2', coord: [121.50, 31.23], caption: '黄浦江 · 示例', sample: true },
    { place: 'sh', art: 'sh', coord: [120.62, 31.30], caption: '苏州 · 示例', sample: true },
    { place: 'to', art: 'to', coord: [-79.39, 43.64], caption: '湖边 · 示例', sample: true },
    { place: 'to', art: 'to2', coord: [-79.38, 43.66], caption: '多伦多的冬天 · 示例', sample: true },
    { place: 'to', art: 'to', coord: [-79.07, 43.08], caption: '尼亚加拉 · 示例', sample: true },
    { place: 'to', art: 'to2', coord: [-79.69, 44.39], caption: '巴里 · 示例', sample: true },
    { place: 'ca', art: 'ca', coord: [-122.48, 37.81], caption: '金门大桥 · 示例', sample: true },
    { place: 'ca', art: 'ca2', coord: [-118.49, 34.01], caption: '海边 · 示例', sample: true },
    { place: 'ca', art: 'ca', coord: [-121.9, 36.6], caption: '一号公路 · 示例', sample: true }
  ],

  // 最后“回顾”页的信
  letter: [
    '你已经走了很远。',
    '也许有时候，日子里的琐碎会让人忘记自己已经走了多远。所以我想替你记住。',
    '你爱过很多人。你照顾过很多人。你建立过一个家。你也成为了很多人生命里很重要的一部分。',
    '<strong>这些都算数。</strong>',
    '所以前半生，<strong>谢谢你。</strong>',
    '后半生，<strong>慢一点。</strong>去看看你还没看过的地方，去做那些一直没有时间做的事情。',
    '<strong>我会陪你。</strong>'
  ]
};

/* 示例图：画出来的明信片（没有真实照片时显示） */
window.sampleArt = function (kind) {
  const W = 800, H = 800;
  const sky = (a, b, c) => `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".62" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/>`;
  const night = kind.endsWith('2');
  const k = kind.replace('2', '');
  let s = '';
  if (k === 'zz') {
    s = (night ? sky('#3B3550', '#8A6A7A', '#D59C7E') : sky('#EAD9C6', '#E9CDB4', '#D9B99A')) +
      `<circle cx="590" cy="230" r="56" fill="${night ? '#F6D9A8' : '#F3E3CB'}"/>` +
      `<path d="M0 560 Q200 540 400 558 T800 550 V800 H0Z" fill="#B99376"/>` +
      `<path d="M0 650 C200 630 360 675 520 650 S760 635 800 645 V800 H0Z" fill="#D8B48D"/>` +
      (() => { let g = `<g fill="${night ? '#4A3A44' : '#8E6F5E'}">`; let y = 570, w = 86; for (let i = 0; i < 11; i++) { g += `<rect x="${300 - w / 2}" y="${y - 24}" width="${w}" height="24"/><rect x="${300 - w / 2 - 8}" y="${y - 27}" width="${w + 16}" height="4"/>`; y -= 27; w -= 4.5; } return g + `<path d="M288 ${y} L300 ${y - 40} L312 ${y}Z"/></g>`; })() +
      `<g fill="${night ? '#5A4652' : '#A8846F'}"><rect x="80" y="500" width="60" height="70"/><rect x="420" y="490" width="70" height="80"/><rect x="500" y="470" width="40" height="100"/><rect x="680" y="486" width="54" height="84"/></g>`;
  } else if (k === 'sh') {
    s = (night ? sky('#232A44', '#4E4D6B', '#8E6E7A') : sky('#D9DEE0', '#E7DCCF', '#E3CBB8')) +
      `<g fill="${night ? '#1B1F33' : '#8F8A8C'}"><rect x="250" y="380" width="34" height="230"/><rect x="300" y="420" width="40" height="190"/><path d="M470 610 L478 220 Q490 200 500 220 L512 610Z"/><path d="M540 610 L546 290 L574 278 L580 610Z"/><rect x="600" y="400" width="44" height="210"/><rect x="660" y="440" width="50" height="170"/></g>` +
      `<g fill="${night ? '#C77B8A' : '#A0787A'}"><rect x="383" y="250" width="5" height="360"/><circle cx="385" cy="420" r="34"/><circle cx="385" cy="300" r="20"/><circle cx="385" cy="262" r="8"/></g>` +
      `<rect x="0" y="610" width="800" height="190" fill="${night ? '#2E3150' : '#B8AAA0'}"/>` +
      `<g stroke="${night ? '#D9A6A8' : '#E6DCD2'}" stroke-width="3" opacity=".7"><path d="M40 650h120M220 670h160M470 645h110M620 690h140M90 720h90M330 740h120"/></g>`;
  } else if (k === 'to') {
    s = (night ? sky('#283246', '#55627A', '#B9A2A0') : sky('#D7DDE0', '#E6E3DC', '#EDE3D5')) +
      `<g fill="#F7F4EE" opacity=".85"><circle cx="120" cy="140" r="3"/><circle cx="260" cy="100" r="3"/><circle cx="420" cy="170" r="3"/><circle cx="610" cy="90" r="3"/><circle cx="700" cy="200" r="3"/><circle cx="60" cy="260" r="3"/></g>` +
      `<g fill="${night ? '#1E2433' : '#857F7E'}"><path d="M392 590 L398 220 L402 220 L408 590Z"/><ellipse cx="400" cy="400" rx="24" ry="9"/><path d="M386 404 h28 l-4 -22 h-20Z"/><rect x="398.5" y="130" width="3" height="94"/>` +
      `<rect x="120" y="470" width="56" height="120"/><rect x="186" y="430" width="44" height="160"/><rect x="238" y="490" width="60" height="100"/><rect x="306" y="450" width="50" height="140"/><rect x="440" y="440" width="54" height="150"/><rect x="502" y="480" width="46" height="110"/><rect x="556" y="420" width="40" height="170"/><rect x="604" y="500" width="70" height="90"/></g>` +
      `<rect x="0" y="590" width="800" height="210" fill="${night ? '#3A4560' : '#B9BDBC'}"/>` +
      `<g stroke="#E8E6E1" stroke-width="3" opacity=".7"><path d="M60 640h140M300 670h170M560 645h130M120 710h110M430 730h170"/></g>`;
  } else {
    s = (night ? sky('#4A3B5C', '#C27E7A', '#EDB083') : sky('#EBCDB6', '#EFC9A8', '#E3B394')) +
      `<circle cx="400" cy="500" r="90" fill="#F5DDB8"/>` +
      `<path d="M0 450 Q120 390 260 440 T520 420 Q640 390 800 440 V540 H0Z" fill="${night ? '#6E4A5A' : '#C79A84'}"/>` +
      `<rect x="0" y="520" width="800" height="280" fill="${night ? '#8A6A7E' : '#C0A098'}"/>` +
      `<g stroke="#F4DCC0" stroke-width="3" opacity=".8"><path d="M330 560h140M350 600h100M300 650h200M360 700h80"/></g>` +
      `<g fill="${night ? '#3B2A35' : '#9E6E62'}"><rect x="150" y="300" width="14" height="240"/><rect x="600" y="300" width="14" height="240"/><rect x="0" y="494" width="800" height="9"/></g>` +
      `<path d="M-40 480 Q60 420 157 302 Q382 540 607 302 Q700 420 840 480" fill="none" stroke="${night ? '#3B2A35' : '#9E6E62'}" stroke-width="3"/>`;
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${s}</svg>`);
};
