# 妈妈，你已经走了这么远

给妈妈 50 岁生日的一份礼物：一张可以拆开的人生地图。

## 它能做什么

- **拆礼物**：打开网页，先看到一个包好的礼物，点一下，地图从盒子里展开。
- **照片地图**：照片像 iPhone“照片”里的地图一样显示在地点上，放大后会一层层分开。
- **写明信片**：每个地方都可以写明信片、选一张邮票、贴一张照片。
- **加照片**：妈妈可以从手机相册加照片。照片里如果带位置，就会出现在拍摄的地方。
- **记一个地方**：搜索、在地图上点、或者用现在的位置，记下一个地方，选心情、写下想说的话，可以加照片（照片里有位置会自动用上）。
- **完成**：点“完成”，看到按年份排好的一生回顾，最后是一封信。

## 要注意的

- 妈妈写的明信片、加的照片，**只保存在她用的那台手机/平板的浏览器里**。建议她一直用同一台设备、同一个浏览器打开。
- iPhone 选照片时，如果想保留拍摄地点：在选择照片的界面点“选项”，打开“位置”。

## 修改内容

所有文字都在 `js/data.js`：
- `journey`：打开礼物后的一生旅程，一站一站。每一站的 `at` 是准确位置——在 Google 地图上右键点那个地方，复制第一行的坐标（比如 `34.7466, 113.6253`）粘贴进来；`photos` 里填 `src` 后，照片就会贴在地图上那个位置
- `places`：默认的四个地方和“我记得”
- `photos`：你放进去的照片（现在是示例图，标着 `sample: true`）
- `letter`：回顾页最后的信

### 换成真实照片

1. 把照片放进 `photos/` 文件夹，例如 `photos/toronto-1.jpg`
2. 在 `js/data.js` 的 `photos` 里加一行：
   ```js
   { place: 'to', src: 'photos/toronto-1.jpg', coord: [-79.39, 43.64], caption: '湖边', date: '2015-08' },
   ```
3. 删掉 `sample: true` 的示例图

## 用到的

- [MapLibre GL JS](https://maplibre.org/)（地图引擎）
- [OpenFreeMap](https://openfreemap.org/)（免费地图，数据来自 © OpenStreetMap 贡献者）
- [Supercluster](https://github.com/mapbox/supercluster)（照片聚合）
- [exifr](https://github.com/MikeKovarik/exifr)（读取照片位置和日期）
- 地点搜索：[Nominatim](https://nominatim.org/)
