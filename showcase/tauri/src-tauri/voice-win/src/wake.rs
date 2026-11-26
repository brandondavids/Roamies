// The wake phrase "Hey E.V." (said "Ee-vee"), or the name alone at the start; kept in step with WakeWord in
// voice/main.swift.

const GREETINGS: [&str; 5] = ["hey", "hi", "hay", "heya", "hiya"];
// Every way the recogniser writes E.V.
const DEFAULT_NAMES: [&str; 3] = ["eve", "eevee", "evie"];
// One letter off the name, but everyday words: they mustn't wake it without a greeting.
const NAME_STOP: [&str; 4] = ["even", "ever", "evil", "eves"];

pub struct WakeWord {
    names: Vec<String>,
    /// The chosen name ("Jarvis"); None for E.V.
    custom: Option<String>,
}

impl Default for WakeWord {
    fn default() -> Self {
        WakeWord { names: DEFAULT_NAMES.map(String::from).to_vec(), custom: None }
    }
}

/// A word of the text, lowercased without apostrophes ("Roamie's" -> "roamies"), and where it sits (byte offsets).
pub struct Token {
    pub word: String,
    pub start: usize,
    pub end: usize,
}

pub struct Scan {
    pub rest: Option<String>,
    pub distance: Option<usize>,
}

impl WakeWord {
    pub fn custom(&self) -> Option<&str> {
        self.custom.as_deref()
    }

    /// None, "" or any spelling of E.V. goes back to E.V.; anything else must be 4-20 letters.
    pub fn set_name(&mut self, raw: Option<&str>) -> bool {
        let w: String = raw.unwrap_or("").to_lowercase().chars().filter(|c| c.is_alphabetic()).collect();
        if w.is_empty() || DEFAULT_NAMES.contains(&w.as_str()) || w == "ev" {
            *self = WakeWord::default();
            return true;
        }
        let n = w.chars().count();
        if !(4..=20).contains(&n) {
            return false;
        }
        let mut cs = w.chars();
        self.custom = cs.next().map(|f| f.to_uppercase().chain(cs).collect());
        self.names = vec![w];
        true
    }

    /// Same first letter and a length within one of a spelling: "Eve" takes "Eva" and "Ever", not "Hive".
    fn plausible(&self, heard: &str) -> bool {
        let first = heard.chars().next();
        let h = heard.chars().count();
        match &self.custom {
            Some(_) => {
                let Some(n) = self.names.first() else { return false };
                first == n.chars().next() && h + 1 >= n.chars().count()
            }
            None => self.names.iter().any(|n| {
                let c = n.chars().count();
                first == n.chars().next() && h + 1 >= c && h <= c + 1
            }),
        }
    }

    /// E.V. is short and spelled several ways, so two edits; a user's own name is stricter (0-2 by length).
    fn allowed_edits(&self) -> i64 {
        let n = self.names.first().map_or(0, |n| n.chars().count());
        if self.custom.is_none() {
            return 2;
        }
        if n >= 8 {
            2
        } else if n >= 6 {
            1
        } else {
            0
        }
    }

    /// What was said after the phrase ("" if nothing yet), or None when the phrase isn't there.
    pub fn match_rest(&self, text: &str) -> Option<String> {
        self.scan(text).rest
    }

    /// The match, plus the closest name's edit distance after a greeting (None if no greeting).
    pub fn scan(&self, text: &str) -> Scan {
        let words = tokens(text);
        let mut closest: Option<usize> = None;
        for i in 0..words.len().saturating_sub(1) {
            let w = &words[i];
            if !GREETINGS.contains(&w.word.as_str()) {
                continue;
            }
            let before = &text[if i == 0 { 0 } else { words[i - 1].end }..w.start];
            // Up to two stray words may come first ("um", "okay", a cough heard as "the"); live text rarely has a full stop.
            let at_start = i <= 2 || before.contains(['.', '?', '!']);
            // Only spaces or a comma between greeting and name ("Hey, Eve").
            if !text[w.end..words[i + 1].start].chars().all(|c| c == ' ' || c == ',') {
                continue;
            }
            let mut candidates = vec![(words[i + 1].word.clone(), words[i + 1].end, self.allowed_edits())];
            // Split in two ("Ev e"): joined, it must be a closer match.
            if i + 2 < words.len() {
                candidates.push((words[i + 1].word.clone() + &words[i + 2].word, words[i + 2].end, self.allowed_edits() - 1));
            }
            for (name, end, allowed) in candidates {
                let d = self.distance(&name);
                closest = Some(closest.map_or(d, |c| c.min(d)));
                if (d as i64) <= allowed && self.plausible(&name) && at_start {
                    let rest = text[end..].trim_start_matches(|c: char| !c.is_alphanumeric());
                    return Scan { rest: Some(rest.trim().to_string()), distance: Some(d) };
                }
            }
        }
        // The name alone, only at the very start ("E.V., open Spotify"); mid-sentence it never wakes.
        if self.custom.is_none() && !words.is_empty() {
            // "Ee vee" must read as the name, not as "ee".
            let mut best: Option<(usize, usize)> = None;
            for n in 1..=2.min(words.len()) {
                let name: String = words[..n].iter().map(|w| w.word.as_str()).collect();
                if NAME_STOP.contains(&name.as_str()) {
                    continue;
                }
                let d = self.distance(&name);
                closest = Some(closest.map_or(d, |c| c.min(d)));
                if d <= 1 && self.plausible(&name) && best.is_none_or(|(bd, _)| d < bd) {
                    best = Some((d, words[n - 1].end));
                }
            }
            if let Some((d, end)) = best {
                let rest = text[end..].trim_start_matches(|c: char| !c.is_alphanumeric());
                return Scan { rest: Some(rest.trim().to_string()), distance: Some(d) };
            }
        }
        Scan { rest: None, distance: closest }
    }

    fn distance(&self, word: &str) -> usize {
        self.names.iter().map(|n| edits(word, n)).min().unwrap_or(usize::MAX)
    }
}

/// What follows the first n words of the text: the wake phrase as first heard, once a later reading of it no longer
/// matches ("Hey Romies" revised to "Hey Romy is"), so it still isn't sent as part of the request.
pub fn dropping(n: usize, text: &str) -> String {
    if n == 0 {
        return text.to_string();
    }
    let words = tokens(text);
    match words.get(n) {
        Some(w) => text[w.start..].trim().to_string(),
        None => String::new(),
    }
}

pub fn tokens(text: &str) -> Vec<Token> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let push = |s: usize, e: usize, out: &mut Vec<Token>| {
        let w: String = text[s..e].to_lowercase().chars().filter(|&c| c != '\'' && c != '\u{2019}').collect();
        if !w.is_empty() {
            out.push(Token { word: w, start: s, end: e });
        }
    };
    for (i, c) in text.char_indices() {
        let in_word = c.is_alphanumeric() || ((c == '\'' || c == '\u{2019}') && start.is_some());
        if in_word {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            push(s, i, &mut out);
        }
    }
    if let Some(s) = start {
        push(s, text.len(), &mut out);
    }
    out
}

fn edits(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() || b.is_empty() {
        return a.len().max(b.len());
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = prev.clone();
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]));
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    // The cases from `voice --test-wake` (voice/main.swift).
    fn check(w: &WakeWord, text: &str, want: Option<&str>) {
        assert_eq!(w.match_rest(text).as_deref(), want, "{text:?}");
    }

    #[test]
    fn the_phrase_and_its_near_misses() {
        let w = WakeWord::default();
        for (text, want) in [
            ("Hey Eve", Some("")),
            ("Hey Eve, open Safari.", Some("open Safari.")),
            ("hey eve open safari", Some("open safari")),
            ("Hey, Eve.", Some("")),
            ("Hi Eve what time is it?", Some("what time is it?")),
            ("Hey Eva", Some("")),
            ("Hey Ever", Some("")),
            ("HEY EVE! What's on today?", Some("What's on today?")),
            ("Hey evee, open notes", Some("open notes")),
            ("That's it. Hey Eve, open Mail", Some("open Mail")),
            ("Um hey Eve, open Mail", Some("open Mail")),
            ("Okay, hi Eve", Some("")),
            // Spelled out, as it's said: "Ee-vee", the letters E.V., "Evie".
            ("Eevee", Some("")),
            ("Eevee, open Spotify", Some("open Spotify")),
            ("Ee vee open spotify", Some("open spotify")),
            ("E.V., open Spotify", Some("open Spotify")),
            ("E V what time is it", Some("what time is it")),
            ("Evie, what's the weather?", Some("what's the weather?")),
            ("Hey Eevee, open Mail", Some("open Mail")),
            ("Hey E.V.", Some("")),
            // The name on its own at the start works without a greeting; said mid-sentence it doesn't.
            ("Eve", Some("")),
            ("Eve, open Notes", Some("open Notes")),
            ("Eve is great", Some("is great")),
            ("I told him hey Eve", None),
            ("So I said hey Eve", None),
            ("Hey I've", None),
            ("Hey Hive", None),
            ("Hey Roamies", None),
            ("Hey Roamie", None),
            ("Hey there", None),
            ("Hey", None),
            ("Hey. Eve", None),
            ("Even better", None),
            ("Ever since then", None),
            ("Hey Everest", None),
            ("Evelyn called", None),
            ("", None),
        ] {
            check(&w, text, want);
        }
    }

    #[test]
    fn dropping_takes_the_first_words_off() {
        assert_eq!(dropping(2, "Hey Romy's, what time is it?"), "what time is it?");
        assert_eq!(dropping(2, "Hey Romy's"), "");
        assert_eq!(dropping(3, "Um hey Romy's open Mail"), "open Mail");
        assert_eq!(dropping(0, "open Mail"), "open Mail");
    }

    #[test]
    fn a_name_of_the_users_own() {
        let mut w = WakeWord::default();
        assert!(!w.set_name(Some("Bob")));
        assert!(!w.set_name(Some("a really very long name for this")));
        assert!(w.set_name(Some("Jarvis")));
        assert_eq!(w.custom(), Some("Jarvis"));
        for (text, want) in [
            ("Hey Jarvis", Some("")),
            ("Hey Jarvis, open Safari.", Some("open Safari.")),
            ("hi jarvis what time is it", Some("what time is it")),
            ("Hey Jervis, open Notes", Some("open Notes")),
            ("Hey Jar vis, hello", Some("hello")),
            ("Hey Travis", None),
            ("Hey Service", None),
            ("Hey Roamies", None),
            ("Jarvis is great", None),
            ("I told him hey Jarvis", None),
        ] {
            check(&w, text, want);
        }
        assert!(w.set_name(Some("Nova")));
        check(&w, "Hey Nova, play music", Some("play music"));
        check(&w, "Hey Nora", None);
        assert!(w.set_name(Some("")));
        assert_eq!(w.custom(), None);
        check(&w, "Hey Eve, open Mail", Some("open Mail"));
        check(&w, "Hey Jarvis", None);
        assert!(w.set_name(None));
        assert!(w.set_name(Some("Eve")));
        assert_eq!(w.custom(), None, "Eve is the app's own name, not a custom one");
        check(&w, "Hey Eve, open Mail", Some("open Mail"));
    }
}
