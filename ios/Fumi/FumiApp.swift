import SwiftUI
import WidgetKit

struct MailItem: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var sender: String
    var subject: String
    var preview: String
    var body: String
    var receivedAt: Date
    var isRead: Bool = false
}

enum VerificationCode {
    // Only extract plausible short numeric codes in authentication-related messages.
    private static let words = ["認証", "確認コード", "ワンタイム", "ログイン", "verification", "security code", "one-time", "otp", "sign-in", "two-factor"]
    static func extract(from mail: MailItem) -> String? {
        let context = "\(mail.subject) \(mail.body)".lowercased()
        guard words.contains(where: { context.contains($0) }) else { return nil }
        let patterns = [
            #"(?:認証コード|確認コード|セキュリティコード|verification code|security code|one-time code|otp)[^\d]{0,30}(\d{4,8})(?!\d)"#,
            #"(?<!\d)(\d{6})(?!\d)"#
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
                  let match = regex.firstMatch(in: context, range: NSRange(context.startIndex..., in: context)),
                  let range = Range(match.range(at: 1), in: context) else { continue }
            return String(context[range])
        }
        return nil
    }
}

enum SharedCodes {
    static let group = "group.dev.fumi.mail"
    static let key = "latestVerificationCode"
    static let dateKey = "latestVerificationDate"

    static func publish(_ code: String?) {
        guard let defaults = UserDefaults(suiteName: group) else { return }
        if let code {
            defaults.set(code, forKey: key)
            defaults.set(Date().timeIntervalSince1970, forKey: dateKey)
        } else {
            defaults.removeObject(forKey: key)
            defaults.removeObject(forKey: dateKey)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "FumiCodeWidget")
    }
}

@MainActor
final class MailStore: ObservableObject {
    @Published var messages: [MailItem] = [
        MailItem(sender: "Fumi", subject: "Fumiへようこそ", preview: "iPhone版の準備ができました", body: "現在はデモ表示です。メールアカウントとの接続はまだ実装されていません。", receivedAt: .now)
    ]
    @Published var searchText = ""
    @Published var showCodesOnWidget = false {
        didSet { refreshWidget() }
    }

    var filtered: [MailItem] {
        guard !searchText.isEmpty else { return messages }
        return messages.filter { [$0.sender, $0.subject, $0.preview, $0.body].contains { $0.localizedCaseInsensitiveContains(searchText) } }
    }

    func setRead(_ id: UUID) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[i].isRead = true
    }

    func refreshWidget() {
        guard showCodesOnWidget,
              let recent = messages.sorted(by: { $0.receivedAt > $1.receivedAt }).first(where: {
                  Date().timeIntervalSince($0.receivedAt) < 600 && VerificationCode.extract(from: $0) != nil
              }) else {
            SharedCodes.publish(nil)
            return
        }
        SharedCodes.publish(VerificationCode.extract(from: recent))
    }
}

@main
struct FumiApp: App {
    @StateObject private var store = MailStore()
    var body: some Scene {
        WindowGroup { ContentView().environmentObject(store) }
    }
}

struct ContentView: View {
    @EnvironmentObject private var store: MailStore
    var body: some View {
        TabView {
            NavigationStack {
                List(store.filtered) { mail in
                    NavigationLink {
                        MailDetail(mail: mail)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(mail.sender).fontWeight(mail.isRead ? .regular : .semibold)
                                Spacer()
                                Text(mail.receivedAt, style: .time).font(.caption).foregroundStyle(.secondary)
                            }
                            Text(mail.subject).font(.subheadline).fontWeight(mail.isRead ? .regular : .medium)
                            Text(mail.preview).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }.padding(.vertical, 5)
                    }
                }
                .navigationTitle("受信トレイ")
                .searchable(text: $store.searchText, prompt: "メールを検索")
                .overlay { if store.filtered.isEmpty { ContentUnavailableView.search(text: store.searchText) } }
            }
            .tabItem { Label("メール", systemImage: "envelope") }

            NavigationStack {
                Form {
                    Section("メールアカウント") {
                        Label("未接続（デモモード）", systemImage: "exclamationmark.circle")
                        Text("Gmail・iCloudとの同期と送受信は今後実装します。").foregroundStyle(.secondary)
                    }
                    Section("認証コードウィジェット") {
                        Toggle("認証コードをウィジェットに表示", isOn: $store.showCodesOnWidget)
                        Text("ロック画面やホーム画面からコードを見られる人がいるため、初期設定ではオフです。表示する場合も最新10分以内のコードだけに限定します。")
                            .font(.footnote).foregroundStyle(.secondary)
                        Button("表示中のコードを消去", role: .destructive) { SharedCodes.publish(nil) }
                    }
                }
                .navigationTitle("設定")
            }
            .tabItem { Label("設定", systemImage: "gearshape") }
        }
        .tint(.primary)
    }
}

struct MailDetail: View {
    @EnvironmentObject private var store: MailStore
    let mail: MailItem
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(mail.subject).font(.title2.bold())
                HStack {
                    Text(mail.sender).fontWeight(.semibold)
                    Spacer()
                    Text(mail.receivedAt, format: .dateTime.month().day().hour().minute()).foregroundStyle(.secondary)
                }
                Divider()
                Text(mail.body).textSelection(.enabled)
                if let code = VerificationCode.extract(from: mail) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("認証コード").font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Text(code).font(.system(.title, design: .monospaced)).fontWeight(.bold)
                            Spacer()
                            ShareLink(item: code) { Image(systemName: "square.and.arrow.up") }
                            Button {
                                UIPasteboard.general.string = code
                            } label: { Image(systemName: "doc.on.doc") }
                            .accessibilityLabel("コードをコピー")
                        }
                    }
                    .padding()
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding()
        }
        .navigationTitle("メール")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { store.setRead(mail.id) }
    }
}
