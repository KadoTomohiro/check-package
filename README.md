# Package Checker

NPMプロジェクトから指定されたパッケージのバージョンをチェックするスクリプトです。

## 機能

- テキストファイルに記載されたパッケージリストをもとに、NPMプロジェクト内のパッケージを検査
- パッケージが検出された場合、バージョン情報をCSVファイルに出力
- セマンティックバージョニングに対応したバージョン比較
- NPMスコープ付きパッケージ（@namespace/package）に対応
- **package-lock.json対応**: 間接的な依存関係（内部の依存によって混入したパッケージ）も自動検出

## インストール

```bash
npm install
```

## 使用方法

```bash
node check-packages.js <パッケージリストファイル> <プロジェクトパス> [出力ファイル]
```

### 引数

- `パッケージリストファイル`: チェック対象のパッケージを記載したテキストファイル
- `プロジェクトパス`: チェック対象のNPMプロジェクトのパス
- `出力ファイル` (オプション): 結果を出力するCSVファイルのパス（デフォルト: result.csv）

### 例

```bash
# サンプルパッケージリストで現在のプロジェクトをチェック
node check-packages.js sample-packages.txt . output.csv

# 別のプロジェクトをチェック
node check-packages.js packages.txt /path/to/your/project result.csv
```

## パッケージリストの形式

パッケージリストは以下の形式で記載してください：

```
パッケージ名@バージョン
パッケージ名（バージョン省略可）
@namespace/package@バージョン
@namespace/package
```

### 例

```
react@17.0.0
lodash@4.17.21
express
@types/node@16.0.0
@babel/core@7.15.0
```

## 出力形式

検出されたパッケージは以下の形式でCSVファイルに出力されます：

```csv
パッケージ名,バージョン,警告
react,18.2.0,
lodash,4.17.20,×
express,4.18.0,
```

- **警告列**: 検出されたバージョンがパッケージリストで指定されたバージョン以下の場合に「×」が表示されます

## 対応パッケージタイプ

以下のpackage.json内のパッケージタイプに対応しています：

- `dependencies`
- `devDependencies` 
- `peerDependencies`

**package-lock.json対応**:
- package-lock.jsonが存在する場合、間接的な依存関係も自動検出
- npm v1-v6形式 (`dependencies`フィールド) および npm v7+形式 (`packages`フィールド) の両方に対応
- 内部の依存によって混入したパッケージも検出可能

### 検出例

**package.jsonのみの場合** (6パッケージ検出):
```
react, lodash, express, @types/node, typescript, @babel/core
```

**package-lock.json使用時** (11パッケージ検出):
```
上記 + loose-envify, accepts, cookie, debug, js-tokens
```

## 依存関係

- [semver](https://www.npmjs.com/package/semver): セマンティックバージョニングの比較に使用

## ライセンス

MIT
