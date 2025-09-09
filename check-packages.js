#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');

/**
 * パッケージリストの行からパッケージ名とバージョンを解析
 * @param {string} line - パッケージリストの行
 * @returns {object} - { packageName, version }
 */
function parsePackageLine(line) {
  line = line.trim();
  if (!line) return null;

  // @で始まるスコープ付きパッケージの場合
  if (line.startsWith('@')) {
    const parts = line.split('@');
    if (parts.length === 2) {
      // バージョンなし: @scope/package
      return { packageName: line, version: null };
    } else if (parts.length === 3) {
      // バージョンあり: @scope/package@version
      const packageName = `@${parts[1]}`;
      const version = parts[2];
      return { packageName, version };
    }
  } else {
    // 通常のパッケージの場合
    const lastAtIndex = line.lastIndexOf('@');
    if (lastAtIndex === -1) {
      // バージョンなし
      return { packageName: line, version: null };
    } else {
      // バージョンあり
      const packageName = line.substring(0, lastAtIndex);
      const version = line.substring(lastAtIndex + 1);
      return { packageName, version };
    }
  }
  
  return null;
}

/**
 * package-lock.jsonから全ての依存関係を再帰的に収集
 * @param {object} dependencies - package-lock.jsonのdependenciesオブジェクト
 * @param {object} packages - 結果を格納するオブジェクト
 */
function collectAllDependencies(dependencies, packages) {
  if (!dependencies) return;
  
  Object.entries(dependencies).forEach(([name, info]) => {
    if (info.version) {
      // バージョン範囲記号（^, ~, >=など）を除去して実際のバージョンを取得
      const cleanVersion = info.version.replace(/^[\^~>=<]+/, '');
      packages[name] = cleanVersion;
    }
    
    // 入れ子の依存関係も再帰的に処理
    if (info.dependencies) {
      collectAllDependencies(info.dependencies, packages);
    }
  });
}

/**
 * package.jsonとpackage-lock.jsonからパッケージ情報を読み込み
 * @param {string} projectPath - プロジェクトのパス
 * @returns {object} - パッケージ情報
 */
function loadProjectPackages(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageLockPath = path.join(projectPath, 'package-lock.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json が見つかりません: ${packageJsonPath}`);
  }

  try {
    const packages = {};
    
    // まずpackage.jsonから直接の依存関係を読み込み
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
    depTypes.forEach(depType => {
      if (packageJson[depType]) {
        Object.assign(packages, packageJson[depType]);
      }
    });
    
    // package-lock.jsonが存在する場合、全ての依存関係（間接的なものも含む）を読み込み
    if (fs.existsSync(packageLockPath)) {
      try {
        const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
        
        // npm v1-v6形式 (dependenciesフィールド)
        if (packageLock.dependencies) {
          collectAllDependencies(packageLock.dependencies, packages);
        }
        
        // npm v7+形式 (packagesフィールド)
        if (packageLock.packages) {
          Object.entries(packageLock.packages).forEach(([packagePath, info]) => {
            // node_modulesパスからパッケージ名を抽出
            if (packagePath.startsWith('node_modules/')) {
              const packageName = packagePath.replace('node_modules/', '');
              if (info.version && !packageName.includes('/node_modules/')) {
                // ネストしたnode_modulesは除外（直接の依存のみ）
                const cleanVersion = info.version.replace(/^[\^~>=<]+/, '');
                packages[packageName] = cleanVersion;
              }
            }
          });
        }
        
        console.log(`package-lock.json からも依存関係を読み込みました`);
      } catch (lockError) {
        console.warn(`package-lock.json の読み込みに失敗しました（package.jsonのみ使用）: ${lockError.message}`);
      }
    } else {
      console.log('package-lock.json が見つかりません（package.jsonのみ使用）');
    }
    
    return packages;
  } catch (error) {
    throw new Error(`パッケージ情報の読み込みに失敗しました: ${error.message}`);
  }
}

/**
 * パッケージリストファイルを読み込み
 * @param {string} listFilePath - パッケージリストファイルのパス
 * @returns {Array} - パッケージ情報の配列
 */
function loadPackageList(listFilePath) {
  if (!fs.existsSync(listFilePath)) {
    throw new Error(`パッケージリストファイルが見つかりません: ${listFilePath}`);
  }

  const content = fs.readFileSync(listFilePath, 'utf8');
  const lines = content.split('\n');
  const packages = [];

  lines.forEach((line, index) => {
    const parsed = parsePackageLine(line);
    if (parsed) {
      packages.push(parsed);
    }
  });

  return packages;
}

/**
 * バージョンの比較
 * @param {string} installedVersion - インストールされているバージョン
 * @param {string} requiredVersion - 要求されるバージョン
 * @returns {boolean} - インストールされたバージョンが要求バージョン以下かどうか
 */
function isVersionLowerOrEqual(installedVersion, requiredVersion) {
  if (!requiredVersion) return false; // 要求バージョンが指定されていない場合はチェックしない
  
  try {
    // バージョン範囲記号を削除して比較
    const cleanInstalledVersion = semver.clean(installedVersion);
    const cleanRequiredVersion = semver.clean(requiredVersion);
    
    if (!cleanInstalledVersion || !cleanRequiredVersion) {
      return false;
    }
    
    return semver.lte(cleanInstalledVersion, cleanRequiredVersion);
  } catch (error) {
    console.warn(`バージョン比較エラー: ${installedVersion} vs ${requiredVersion}`);
    return false;
  }
}

/**
 * CSVファイルに結果を出力
 * @param {Array} results - 検出結果の配列
 * @param {string} outputPath - 出力ファイルのパス
 */
function writeResultsToCSV(results, outputPath) {
  if (results.length === 0) {
    console.log('検出されたパッケージがありません。');
    return;
  }

  const csvLines = ['パッケージ名,バージョン,警告'];
  
  results.forEach(result => {
    const warning = result.isLowerOrEqual ? '×' : '';
    csvLines.push(`${result.packageName},${result.version},${warning}`);
  });

  fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf8');
  console.log(`結果を ${outputPath} に出力しました。`);
}

/**
 * メイン処理
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('使用方法: node check-packages.js <パッケージリストファイル> <プロジェクトパス> [出力ファイル]');
    console.error('例: node check-packages.js packages.txt ./my-project output.csv');
    process.exit(1);
  }

  const listFilePath = args[0];
  const projectPath = args[1];
  const outputPath = args[2] || 'result.csv';

  try {
    console.log(`パッケージリスト: ${listFilePath}`);
    console.log(`プロジェクトパス: ${projectPath}`);
    console.log(`出力ファイル: ${outputPath}`);
    console.log('');

    // パッケージリストを読み込み
    const packageList = loadPackageList(listFilePath);
    console.log(`パッケージリスト読み込み完了: ${packageList.length}個のパッケージ`);

    // プロジェクトのパッケージ情報を読み込み
    const projectPackages = loadProjectPackages(projectPath);
    console.log(`プロジェクトパッケージ読み込み完了: ${Object.keys(projectPackages).length}個のパッケージ`);

    const results = [];

    // パッケージリストの各パッケージをチェック
    packageList.forEach(listPackage => {
      const installedVersion = projectPackages[listPackage.packageName];
      
      if (installedVersion) {
        const isLowerOrEqual = isVersionLowerOrEqual(installedVersion, listPackage.version);
        
        results.push({
          packageName: listPackage.packageName,
          version: installedVersion,
          requiredVersion: listPackage.version,
          isLowerOrEqual: isLowerOrEqual
        });

        console.log(`✓ 検出: ${listPackage.packageName}@${installedVersion}${isLowerOrEqual ? ' (警告: バージョンが古い)' : ''}`);
      }
    });

    // 結果をCSVファイルに出力
    writeResultsToCSV(results, outputPath);
    
    console.log('');
    console.log(`処理完了: ${results.length}個のパッケージが検出されました。`);
    
  } catch (error) {
    console.error(`エラー: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parsePackageLine,
  collectAllDependencies,
  loadProjectPackages,
  loadPackageList,
  isVersionLowerOrEqual,
  writeResultsToCSV
};
