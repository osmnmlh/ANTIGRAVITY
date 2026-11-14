//
//  DateFormatter.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

extension Date {
    func toStardateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy.MM.dd - HH:mm:ss"
        return "Görev Zamanı: \(formatter.string(from: self))"
    }
}
