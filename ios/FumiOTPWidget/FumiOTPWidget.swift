import WidgetKit
import SwiftUI

private enum WidgetConfig {
    // Replace this with the App Group enabled on BOTH the app and widget targets.
    static let group = "group.dev.xelaods.fumi"
    static let key = "latestOTP"
}

private struct OTPPayload: Codable {
    let code: String
    let sender: String
    let receivedAt: TimeInterval
}

private struct OTPEntry: TimelineEntry {
    let date: Date
    let payload: OTPPayload?
    let privacy: Bool

    var fresh: Bool {
        guard let payload else { return false }
        return payload.receivedAt <= date.timeIntervalSince1970 &&
            date.timeIntervalSince1970 - payload.receivedAt < 15 * 60
    }
}

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> OTPEntry {
        OTPEntry(date: .now, payload: nil, privacy: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (OTPEntry) -> Void) {
        completion(read())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OTPEntry>) -> Void) {
        let current = read()
        // WidgetKit chooses actual update times; no continuous polling.
        let next = current.payload.map {
            Date(timeIntervalSince1970: $0.receivedAt + 15 * 60)
        } ?? Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [current], policy: .after(max(next, Date().addingTimeInterval(60)))))
    }

    private func read() -> OTPEntry {
        let defaults = UserDefaults(suiteName: WidgetConfig.group)
        let raw = defaults?.data(forKey: WidgetConfig.key)
        let payload = raw.flatMap { try? JSONDecoder().decode(OTPPayload.self, from: $0) }
        let privacy = defaults?.object(forKey: "hideCodeOnWidget") as? Bool ?? true
        return OTPEntry(date: .now, payload: payload, privacy: privacy)
    }
}

private struct OTPView: View {
    let entry: OTPEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Image(systemName: "envelope.badge.shield.half.filled")
                Text("Fumi 認証コード").font(.caption.weight(.semibold))
            }
            .foregroundStyle(.secondary)

            if entry.fresh, let payload = entry.payload {
                Text(entry.privacy ? "••••••" : payload.code)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .privacySensitive()
                Text(payload.sender).font(.caption).lineLimit(1)
                if entry.privacy {
                    Text("アプリで確認").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Text("有効なコードはありません").font(.subheadline.weight(.medium))
                Text("Fumiを開いて更新").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "fumi://codes"))
    }
}

struct FumiOTPWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FumiOTPWidget", provider: Provider()) { entry in
            OTPView(entry: entry)
        }
        .configurationDisplayName("Fumi 認証コード")
        .description("最新のメール認証コードを表示します。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct FumiOTPWidgetBundle: WidgetBundle {
    var body: some Widget { FumiOTPWidget() }
}
