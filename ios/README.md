# Fumi for iPhone (開発中)

Windows版Fumiと同じリポジトリに、独立したiOSネイティブアプリとWidgetKit拡張を追加しています。

## 現時点の実装
- SwiftUI受信トレイ、検索、詳細閲覧、既読表示（デモデータ）
- 認証関連の本文から4〜8桁程度のコードを抽出する基本処理（誤検出を含む可能性があります）
- コードのコピー
- WidgetKitのホーム画面ウィジェット（小・中）
- App Groupで本体とウィジェットのコード共有
- ウィジェット表示はオプトイン、コードは共有後10分で期限切れ扱い（WidgetKitの再描画時刻はOSが決定）

**注意：メール接続・OAuth・IMAP・送受信・通知は未実装です。現状のデモメールには認証コードはなく、ウィジェットは「コードなし」を表示します。実際のメールや認証コードの表示には次の開発が必要です。**

## Xcodeで開く
MacとXcodeが必要です。XcodeGenをインストールしてから：

```bash
cd ios
xcodegen generate
open Fumi.xcodeproj
```

XcodeのSigning & Capabilitiesで自分のApple Development Teamを設定し、`dev.fumi.mail` / `dev.fumi.mail.widget` と `group.dev.fumi.mail` を利用可能な一意のBundle ID / App Groupへ変更してください。YAML、Swiftの両方にあるApp Group IDを一致させてください。署名・配布・実機テストは未実施です。

## 次に実装するもの
1. Gmail OAuth（システムブラウザを使用、トークンはKeychainで保持）、iCloudの安全なアカウント設定
2. メール同期、一覧・本文・返信・送信、バックグラウンド更新
3. コードの抽出テストとアカウントごとの表示許可、ロック画面への露出を考慮した保護
4. iOS実機ビルド、署名、TestFlight/IPA出力の検証

iOSのバックグラウンド処理にはOS制限があり、Windows版のIMAP IDLEと同じ常時監視は保証できません。
