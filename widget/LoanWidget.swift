import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), nextDue: "₹1,200", dueDate: "15th Mar", totalOutstanding: "₹5.5L")
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), nextDue: "₹1,200", dueDate: "15th Mar", totalOutstanding: "₹5.5L")
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        // Read data saved by the main React Native app using Shared Group Preferences
        let defaults = UserDefaults(suiteName: "group.com.hkumardev.loanglass")
        let nextDue = defaults?.string(forKey: "widgetNextDue") ?? "₹0"
        let dueDate = defaults?.string(forKey: "widgetDueDate") ?? "N/A"
        let totalOutstanding = defaults?.string(forKey: "widgetTotalOutstanding") ?? "₹0"

        let entry = SimpleEntry(
            date: Date(),
            nextDue: nextDue,
            dueDate: dueDate,
            totalOutstanding: totalOutstanding
        )
        
        // Refresh periodically (e.g. every hour to catch external updates if needed, though app updates it)
        let nextUpdateDate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdateDate))
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let nextDue: String
    let dueDate: String
    let totalOutstanding: String
}

struct LoanWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            Color(red: 248/255, green: 250/255, blue: 252/255) // Slate 50 background
            
            VStack(alignment: .leading, spacing: 8) {
                // Header
                HStack {
                    Image(systemName: "banknote.fill")
                        .foregroundColor(.green)
                    Text("LoanGlass")
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(Color(red: 15/255, green: 23/255, blue: 42/255))
                    Spacer()
                }
                
                Spacer()
                
                // Content
                Text("Next EMI: \(entry.nextDue)")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(Color(red: 16/255, green: 185/255, blue: 129/255)) // Emerald 500
                
                Text("Due Date: \(entry.dueDate)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                if family == .systemMedium {
                    Divider()
                        .background(Color.gray.opacity(0.3))
                    Text("Total Outstanding: \(entry.totalOutstanding)")
                        .font(.footnote)
                        .fontWeight(.semibold)
                        .foregroundColor(Color(red: 15/255, green: 23/255, blue: 42/255))
                }
                
                Spacer()
            }
            .padding()
        }
    }
}

@main
struct LoanWidget: Widget {
    let kind: String = "LoanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            LoanWidgetEntryView(entry: entry)
        }
        .supportedFamilies([.systemSmall, .systemMedium])
        .configurationDisplayName("Loan Tracker")
        .description("Track your upcoming EMI and outstanding loans at a glance.")
    }
}
