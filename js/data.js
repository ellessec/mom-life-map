/* =========================================================
   礼物内容 —— 地点、你写给妈妈的话、你放进去的照片
   想改文字，直接改这里；照片放进 photos/ 文件夹后，在 GIFT_PHOTOS 里登记
   ========================================================= */

window.GIFT = {
  title: '小妈，你已经走了这么远',
  subtitle: "A Map of the Life You've Built",

  // 默认的四个地方（妈妈之后还可以自己添加新的地方）
  places: [
    { id: 'zz', city: '郑州', en: 'Zhengzhou', region: '河南 · 中国', coord: [113.63, 34.75], year: '1977',
      note: '我记得你说起郑州的时候，语气总会慢下来，好像那里的时间走得比别处慢一点。' },
    { id: 'kf', city: '开封', en: 'Kaifeng', region: '河南 · 中国', coord: [114.3645, 34.815], year: '1995',
      note: '' },
    { id: 'sh', city: '上海', en: 'Shanghai', region: '中国', coord: [121.47, 31.23], year: '1999',
      note: '我记得你讲上海的时候，总说那时候有多忙，可是讲着讲着就笑了。' },
    { id: 'to', city: '多伦多', en: 'Toronto', region: '安大略 · 加拿大', coord: [-79.38, 43.65], year: '',
      note: '我记得第一场大雪的时候，你在窗边站了很久，说：“原来这里的雪是这样的。”' },
    { id: 'ca', city: '加州', en: 'California', region: 'Arcadia · 美国', coord: [-118.0519, 34.1316], year: '',
      note: '我记得在海边，你难得什么都没安排，只是坐着看海。' },
    { id: 'pc', city: '蓬塔卡纳', en: 'Punta Cana', region: '多米尼加', coord: [-68.3692, 18.5566], year: '2023',
      note: '' }
  ],

  // 你放进去的照片：{ place: 地点id, src: 'photos/文件名.jpg', coord: [经度, 纬度], caption: '说明', date: '2019-07' }
  photos: [],

  // 打开礼物后的“一生旅程”：地图从第一站开始，一站一站往前走
  //   at:     这一站的准确位置。在 Google 地图上右键点那个地方，第一行就是坐标，直接复制粘贴过来，比如 '34.7466, 113.6253'
  //   spot:   地图上那个点的名字（比如“老家”“河南大学”）
  //   year:   不确定可以留空，用 label 写“那几年”之类
  //   by:     怎么去的这一站：'train' 火车、'plane' 飞机、'local' 市内（不写会按距离自动选）
  //   photos: 会贴在地图上。{ p: '名字' } 用的是 photos/web/名字.jpg（和 photos/thumb/ 里的小图）；
  //           照片自己有 at 的，就贴在那个准确的位置；没有的，贴在这一站。没放照片的写 { hint: '…' }，会是空相框
  born: 1977,
  journey: [
    // 每一站是一个“区域”：镜头落在那一带，这一章的照片各自贴在拍照的地方，小妈自己在地图上走走看看
    // 照片有 at 的贴在那个位置；没有 at 的（比如“半岁”“和陈欣”），贴在这一站的 at（也就是文件夹写的地址）
    { place: 'zz', year: 1977, at: '34.7582, 113.6512', spot: '家 · 西陈庄前街35号',
      title: '你在郑州出生、长大',
      text: '1977 年，你在郑州出生，家在西陈庄前街35号。你在旁边的铭功路小学上学，去碧沙岗公园玩，还去过邙山。那时候还没有我，也还没有这张地图。一切，都是从这里开始的。',
      photos: [{ p: 'zz-6-months', caption: '半岁' }, { p: 'zz-little-1', caption: '一点小的时候' }, { p: 'zz-little-2', caption: '小时候' }, { p: 'zz-bigger', caption: '长大一点了' },
               { p: 'zz-minggong-school', caption: '铭功路小学', at: '34.7600, 113.6522' },
               { p: 'zz-bishagang-park', caption: '碧沙岗公园', at: '34.7520, 113.6244' },
               { p: 'zz-mangshan', caption: '邙山', at: '34.9380, 113.5270' }] },
    { place: 'zz', year: '', label: '上中学', at: '34.7650, 113.6150', spot: '家 · 金海大道54号院',   // TODO: 年份；金海大道54号院的准确位置
      title: '上中学的时候',
      text: '上中学的时候，家在金海大道54号院。陈欣、张文是那时候一起长大的朋友；人民公园、桐柏路、王立砦，都留下过你们的照片。',
      photos: [{ p: 'zz-jinhai-54', caption: '金海大道54号院' }, { p: 'zz-middle-school', caption: '中学' },
               { p: 'zz-with-chenxin', caption: '和陈欣' }, { p: 'zz-zhangwen', caption: '和张文' }, { p: 'zz-with-zhangke', caption: '和张可阿姨' },
               { p: 'zz-peoples-park', caption: '郑州人民公园', at: '34.7594, 113.6539' },
               { p: 'zz-tongbai-road', caption: '桐柏路电力家属院', at: '34.7698, 113.6094' },
               { p: 'zz-wanglizhai', caption: '王立砦家属院', at: '34.7700, 113.6000' }] },           // TODO: 王立砦家属院的准确位置
    { place: 'kf', year: 1995, at: '34.8150, 114.3645', spot: '河南大学', by: 'train',
      title: '去开封上河南大学',
      text: '十八岁，你去开封上了河南大学。那几年认识的人、读过的书、一起出去玩过的地方，后来都跟着你走了很远。',
      photos: [{ p: 'kf-henu-1', caption: '河南大学' }, { p: 'kf-henu-2', caption: '河南大学' }, { p: 'kf-henu-3', caption: '河南大学' },
               { p: 'kf-trip-1', caption: '大学旅游' }, { p: 'kf-trip-2', caption: '大学旅游' },
               { p: 'kf-baogong', caption: '包公祠', at: '34.7938, 114.3332' }] },
    { place: 'sh', year: 1999, at: '31.2285, 121.4021', spot: '华东师范大学',
      title: '去上海读研究生，遇见了爸爸',
      text: '二十二岁，你离开河南，一个人去了上海，在华东师范大学读研究生。一座很大、很快的城市，你在那里重新开始；也是在上海，你遇见了爸爸。',
      photos: [{ p: 'sh-ecnu', caption: '华东师范大学' }] },
    { place: 'sh', year: '', label: '还没毕业', at: '31.2738, 121.4744', spot: '乐宁教育 · 西江湾路420号',     // TODO: 哪一年？（研究生还没毕业的时候）
      title: '和小爸一起，创办了乐宁教育',
      text: '研究生还没毕业，你就和小爸一起创办了乐宁教育。西江湾路420号，是这一切开始的地方——从乐宁教育中心的第一块牌子，到站上台讲话、上新浪教育，再到和大家一起过年会，这些都是你一点一点做出来的。',
      photos: [{ p: 'sh-lening-center', caption: '乐宁教育中心 · 西江湾路420号' }, { p: 'sh-lening-team', caption: '乐宁的大家' },
               { p: 'sh-lening-1', caption: '乐宁教育' }, { p: 'sh-lening-2', caption: '乐宁教育' },
               { p: 'sh-lening-2014', caption: '2014 · 新浪教育' }, { p: 'sh-lening-2019', caption: '2019' }, { p: 'sh-lening-2020', caption: '2020 年会' }] },
    { place: 'sh', year: '', label: '有了我', at: '31.2050, 121.5780', spot: '家 · 罗山路1700弄6号802',      // TODO: 罗山路1700弄的准确位置；年份
      title: '家里多了一个我',
      text: '后来，家里多了一个我。在罗山路1700弄6号802，你抱着我、陪着我，一点一点把我养大。',
      photos: [{ p: 'sh-withme-1', caption: '2007' }, { p: 'sh-withme-2', caption: '和润润' }, { p: 'sh-withme-3', caption: '和润润' },
               { p: 'sh-withme-4', caption: '一家人' }, { p: 'sh-withme-5', caption: '和润润' }, { p: 'sh-withme-6', caption: '和润润' },
               { p: 'sh-luoshan-802', caption: '罗山路1700弄6号802' }] },
    { place: 'sh', year: '', label: '后来', at: '31.2188, 121.5486', spot: '家 · 世纪公园 1402',
      title: '在上海安了家',
      text: '后来，你们在世纪公园旁边的 1402 安了家。家里有过很多热闹的日子，比如一家人一起给奶奶过生日。',
      photos: [{ p: 'sh-home-1402', caption: '世纪公园 1402' }, { p: 'sh-grandma-birthday', caption: '给奶奶过生日' }] },
    { place: 'to', year: '', label: '后来', at: '43.7270, -79.3620', spot: '家 · 1 Chapleau',          // TODO: 年份
      title: '去了多伦多',
      text: '后来，你们去了多伦多，家在 1 Chapleau。York U 就在不远的地方；湖心岛、Scarborough 的情人节、Blue Mountain，还有我在 Lakefield 毕业的那一天——你都在。',
      photos: [{ p: 'to-chapleau-2', caption: '1 Chapleau' }, { p: 'to-chapleau-1', caption: '1 Chapleau' }, { p: 'to-home-3', caption: '在多伦多' },
               { p: 'to-york-u', caption: 'York U', at: '43.7742, -79.5047' },
               { p: 'to-centre-island', caption: '湖心岛', at: '43.6229, -79.3943' },
               { p: 'to-scarborough', caption: '情人节 · Scarborough', at: '43.7761, -79.2584' },
               { p: 'to-lakefield', caption: '我毕业那天 · Lakefield', at: '44.4421, -78.2656' },
               { p: 'trip-bluemountain-1', caption: 'Blue Mountain', at: '44.5019, -80.3108' },
               { p: 'trip-bluemountain-2', caption: 'Blue Mountain', at: '44.5019, -80.3108' }] },
    { place: 'ca', year: '', label: '后来', at: '34.1316, -118.0519', spot: '家 · 594 W Huntington',
      title: '在 Arcadia 的家',
      text: '后来，你们住在 Arcadia 的 594。你说：“每天早晨浇花，听着音乐，看着花朵静静绽放。”你在训练场边陪萌萌练啦啦队，也和我们一起去了 Laguna Beach 和拉斯维加斯。',
      photos: [{ p: 'la-594-1', caption: '594' }, { p: 'la-594-2', caption: '594' }, { p: 'la-594-3', caption: '594' }, { p: 'la-594-4', caption: '594' },
               { p: 'moment-garden-1', caption: '每天早晨浇花' }, { p: 'moment-garden-2', caption: '每天早晨浇花' }, { p: 'moment-garden-3', caption: '每天早晨浇花' },
               { p: 'moment-garden-4', caption: '每天早晨浇花' }, { p: 'moment-garden-5', caption: '每天早晨浇花' }, { p: 'moment-garden-6', caption: '每天早晨浇花' },
               { p: 'moment-cheer-1', caption: '萌萌的啦啦队', at: '34.1296, -118.0364' }, { p: 'moment-cheer-2', caption: '萌萌的啦啦队', at: '34.1296, -118.0364' },
               { p: 'moment-cheer-3', caption: '萌萌的啦啦队', at: '34.1296, -118.0364' }, { p: 'moment-cheer-4', caption: '萌萌的啦啦队', at: '34.1296, -118.0364' },
               { p: 'trip-laguna', caption: 'Laguna Beach', at: '33.5427, -117.7853' },
               { p: 'trip-vegas-paris', caption: '拉斯维加斯 · 巴黎铁塔', at: '36.1122, -115.1706' },
               { p: 'trip-church-resort', caption: 'church resort' }] },        // TODO: church resort 在哪里？现在先放在家
    { place: 'pc', year: 2023, at: '18.5566, -68.3692', spot: 'Punta Cana', by: 'plane',
      title: '一起去看加勒比海',
      text: '2023 年，一家人去了 Punta Cana，看加勒比海。',
      photos: [{ p: 'trip-puntacana-1', caption: 'Punta Cana 2023' }, { p: 'trip-puntacana-2', caption: 'Punta Cana 2023' }, { p: 'trip-puntacana-3', caption: 'Punta Cana 2023' }] }
  ],

  // 她发过的朋友圈和收到的评论（回忆录里会有“你写过的话”）
  moments: [
    { date: '2026-07-16', place: 'ca', at: '34.1316, -118.0519',
      text: '每天早晨浇花，听着音乐，看着花朵静静绽放。想到为什么以前在上海只想着买只能坚持一个星期就凋零的瓶装花，而不是养能感受生命力的盆装花？可能是时间少，就想让花的每一分钟都有效率，马上看到结果，哪怕结果不能持续，也不愿意等待。',
      photos: ['moment-garden-1', 'moment-garden-2', 'moment-garden-3', 'moment-garden-4', 'moment-garden-5', 'moment-garden-6'],
      comments: [{ who: '润润', text: '对自己过往的总结很有道理' }] },
    { date: '2026-08-21', place: 'ca', at: '34.1296, -118.0364',
      text: '以前我以为啦啦队就是喊口号，现在身临其境才真意识到这是个运动项目，相当耗体力，就算站着休息也得昂首挺胸。我发自内心感慨萌萌这个暑假集训能坚持下来，实属不易❤️',
      photos: ['moment-cheer-1', 'moment-cheer-2', 'moment-cheer-3', 'moment-cheer-4'],
      comments: [
        { who: '小舅妈', text: '最近看你朋友圈，有一种特别感受，俩字总结“弥补”…以前你在事业中、在会议室里身临其境，现在你在训练场边，跟着孩子逛商场中身临其境，看似只是空间转换，但内核没变，何校长依然是一个善于观察、懂得反思的人😂。萌萌之所以能坚持，是因为她身后有一个也在学着坚持的妈妈😂。现在你带娃陪伴他们的生活点点滴滴，不是牺牲，是你给自己人生下半场的一份礼物。能放下高光去享受这种琐碎的真实，才是真正活得通透的人。👍👍🤗🤗🤗好羡慕你和陈校长的通透啊😂😂' },
        { who: '小妈', reply: true, text: '哈哈，你真善于总结😊弥补是最初的动机，是用力的，是带有期待的，是初级阶段。现在逐渐进入到欣赏，是轻松的，是没有期待的，是享受的。' }] }
  ],
  // 旅程最后一页，用她自己的话收尾
  closingQuote: { text: '弥补是最初的动机，是用力的。现在逐渐进入到欣赏，是轻松的，是没有期待的，是享受的。', from: '你自己说的 · 2026 年 8 月' },

  // 小服务器（worker/ 文件夹，部署在 Cloudflare）：云端备份 + 日记本的 AI
  //   url: 部署好的网址，比如 'https://mom-life-map.xxx.workers.dev'。不填就没有备份和 AI
  //   ai:  要不要打开 AI（认手写的字、每周/每月回顾的总结）
  server: { url: 'https://mom-life-map.mom-life-map-server.workers.dev', ai: false, site: 'https://ellessec.github.io/mom-life-map/' },   // site: 小妈打开的网址（家庭链接会指向这里）

  // 音效：把声音文件放进 sounds/ 文件夹，在这里写上文件名（mp3 或 m4a 都可以）。空着的就用自带的声音（或者没有声音）
  sounds: {
    open:   '',   // 点开礼物的那一下（空着 = 自带的音乐盒声）
    // 拆礼物时的祝福，一个接一个：[文件, 音量, 点开以后第几秒开始]
    // 录音都已经剪掉了前后的空白、调成一样响。想换顺序，就改开始的秒数
    voice:  ['sounds/voice-birthday.m4a', 1, 0.45],    // 润润：“小妈生日快乐”，盖子飞起来的那一刻（2.9 秒长）
    voice2: ['sounds/birthday-xiaoba.m4a', 1, 3.8],    // 小爸（5.5 秒）
    voice3: ['sounds/birthday-waigong.m4a', 1, 9.75],  // 外公（5.8 秒）
    voice4: ['sounds/birthday-waipo.m4a', 1, 15.95],   // 外婆（3.2 秒）
    unfold: '',   // 纸地图展开
    music:  '',   // 背景音乐：从拆礼物一直到旅程结束，最后慢慢变小（会循环）
    train:  '',   // 坐火车的那一段
    plane:  '',   // 坐飞机的那一段
    bloom:  '',   // 每到一站，花开的那一下
    diary:  ['sounds/diary-voice.m4a', 1],   // “自个的计划生活”：每次打开日记本、还有打招呼的时候（问候说完以后）都会放
    // 打招呼的时候，点开花苞以后说的话（按时间选；都已经剪好、调成一样响）
    greetMorning: ['sounds/greet-morning.m4a', 1],      // 早上好小妈（5 点–11 点）
    greetNoon:    ['sounds/greet-noon.m4a', 1],         // 中午好小妈（11 点–14 点）
    greetDay:     '',                                   // 下午好小妈（14 点–18 点）还没录
    greetEvening: ['sounds/greet-evening.m4a', 1]      // 晚上好小妈（18 点以后）
  },

  // 歌：在“🎵 听一首歌”里，用 YouTube 播放（yt 是 YouTube 视频网址 watch?v= 后面那一串）
  songs: [
    { title: 'When You Believe', artist: 'Whitney Houston & Mariah Carey', yt: 'LKaXY4IdZ40',
      note: '《埃及王子》的主题曲，讲摩西带领以色列人出埃及。“Many nights we’ve prayed, with no proof anyone could hear… There can be miracles when you believe.”' }
  ],
  // 背景音乐：在网页里现场生成的轻柔音乐（没有文件，没有版权问题）；有人说话、放歌的时候会自动变小
  ambient: true,

  // 以后打开网站时的问候（在“设置”里选“直接跟我打招呼”）
  welcome: {
    from: '— 润润',
    // 每次打开随机一句
    lines: [
      '我好期待听你分享你的想法。',
      '今天过得怎么样？想写什么都可以，我都想看。',
      '你写下的每一句，我都会好好珍惜。',
      '不用写很多，一句话也很好。',
      '谢谢你愿意把你的日子分享给我。',
      '想到你在写日记，我就觉得很安心。',
      '今天有什么想感谢的吗？',
      '慢慢来，这里一直等着你。'
    ],
    // 每天一节（和合本），按日子轮流
    verses: [
      ['耶和华是我的牧者，我必不致缺乏。', '诗篇 23:1'],
      ['应当一无挂虑，只要凡事借着祷告、祈求，和感谢，将你们所要的告诉神。神所赐、出人意外的平安，必在基督耶稣里保守你们的心怀意念。', '腓立比书 4:6-7'],
      ['要常常喜乐，不住地祷告，凡事谢恩；因为这是神在基督耶稣里向你们所定的旨意。', '帖撒罗尼迦前书 5:16-18'],
      ['这是耶和华所定的日子，我们在其中要高兴欢喜。', '诗篇 118:24'],
      ['我们不至消灭，是出于耶和华诸般的慈爱；是因他的怜悯不至断绝。每早晨这都是新的；你的诚实，极其广大！', '耶利米哀歌 3:22-23'],
      ['你要专心仰赖耶和华，不可倚靠自己的聪明，在你一切所行的事上都要认定他，他必指引你的路。', '箴言 3:5-6'],
      ['凡劳苦担重担的人可以到我这里来，我就使你们得安息。', '马太福音 11:28'],
      ['但那等候耶和华的必从新得力。他们必如鹰展翅上腾；他们奔跑却不困倦，行走却不疲乏。', '以赛亚书 40:31'],
      ['直到你们年老，我仍这样；直到你们发白，我仍怀搋。我已造作，也必保抱；我必怀搋，也必拯救。', '以赛亚书 46:4'],
      ['求你指教我们怎样数算自己的日子，好叫我们得着智慧的心。', '诗篇 90:12'],
      ['我的心哪，你要称颂耶和华！不可忘记他的一切恩惠！', '诗篇 103:2'],
      ['神是我们的避难所，是我们的力量，是我们在患难中随时的帮助。', '诗篇 46:1'],
      ['我们晓得万事都互相效力，叫爱神的人得益处，就是按他旨意被召的人。', '罗马书 8:28'],
      ['他对我说：我的恩典够你用的，因为我的能力是在人的软弱上显得完全。', '哥林多后书 12:9'],
      ['你出你入，耶和华要保护你，从今时直到永远。', '诗篇 121:8'],
      ['愿耶和华赐福给你，保护你。愿耶和华使他的脸光照你，赐恩给你。愿耶和华向你仰脸，赐你平安。', '民数记 6:24-26'],
      ['耶和华说：我知道我向你们所怀的意念是赐平安的意念，不是降灾祸的意念，要叫你们末后有指望。', '耶利米书 29:11'],
      ['我岂没有吩咐你吗？你当刚强壮胆！不要惧怕，也不要惊惶；因为你无论往哪里去，耶和华你的神必与你同在。', '约书亚记 1:9']
    ]
  },

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
      `<g fill="#FFF8F1" opacity=".85"><circle cx="120" cy="140" r="3"/><circle cx="260" cy="100" r="3"/><circle cx="420" cy="170" r="3"/><circle cx="610" cy="90" r="3"/><circle cx="700" cy="200" r="3"/><circle cx="60" cy="260" r="3"/></g>` +
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
