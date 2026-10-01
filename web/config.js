// IT博士チャレンジの設定。分野・返し・表情はここに足していけば画面に反映される。

export const MODEL = "jev-latest";
export const PRICE_PER_MTOK = 0.042; // 入力トークンのみ課金（docs.typesafe.ai/models）
export const JPY_PER_USD = 160;      // 表示用の概算レート

export const CHUNK_IDLE_MS = 400;     // 入力がこの時間止まったら、新しく入った部分をすぐ判定する
export const CHUNK_MAX_CHARS = 40;    // 話し続けていても、これだけ溜まったら判定する
export const LAST_WORD_IDLE_MS = 1000; // 末尾の語は、この時間入力が止まるまで「言いかけ」とみなして判定を待つ
export const HISTORY_TURNS = 6;       // state に含める直近のやりとり数

// ---- ゲーム: IT博士チャレンジ ----
// 送信ボタンは無い。話した（打った）文章は入力欄に溜まり続け、新しく入った部分を次々に判定する。
// 候補語はコードで拾い（英字・カタカナ・漢字の語）、1語ずつ「どの分野の IT 用語か／用語ではないか」を
// Choice で並列に聞く。IT 用語である確率（= 1 - not_it）が threshold 以上なら、その分野のメーターに入る。
// 各分野 perCategory 語で満タン。全分野が満タン（100 点）でクリア。分野の名前そのものは数えない。
export const GAME = {
  title: "IT博士チャレンジ",
  perCategory: 2,
  threshold: 0.8,
  maxCandidates: 8, // 1回に判定する候補語の上限（1語あたり5問聞く）
  categories: [
    {
      id: "cloud", label: "クラウド", color: "#5cb8ff",
      desc: "AWS・Azure・GCP などのクラウドや、その上のサービス（Lambda, S3, Bedrock, IAM など）",
      aliases: ["クラウド", "cloud", "クラウドサービス"],
    },
    {
      id: "network", label: "ネットワーク", color: "#5ce1a0",
      desc: "通信やインフラ（HTTP, TCP, DNS, ロードバランサー, CDN など）",
      aliases: ["ネットワーク", "network", "インフラ", "通信"],
    },
    {
      id: "database", label: "データベース", color: "#ffc94d",
      desc: "データの保存や検索（SQL, Oracle, DynamoDB, インデックス, トランザクション など）",
      aliases: ["データベース", "database", "db", "データ"],
    },
    {
      id: "programming", label: "プログラミング", color: "#b58cff",
      desc: "プログラミング言語や開発手法（Python, TypeScript, Git, API, コンパイラ など）",
      aliases: ["プログラミング", "プログラム", "programming", "言語", "コード", "開発"],
    },
    {
      id: "security", label: "セキュリティ", color: "#ff7c7c",
      desc: "安全や認証（TLS, 暗号化, 認証, ファイアウォール, 脆弱性 など）",
      aliases: ["セキュリティ", "security", "安全"],
    },
  ],
  // 「IT の話で使われた一般語」まで IT 用語扱いされないよう、例を挙げて境界をはっきりさせる
  notIt: "IT の専門用語ではない言葉。IT の話の中で使われていても、日常でも普通に使う一般的な言葉（管理、設定、利用、モデル、基本 など）はこちら",
  termQuestion: "`segment` の中で使われている `word` は、どの分野の IT 専門用語か。音声認識の誤変換やカタカナ読みで表記が崩れていても、意図された語で判断する。IT の専門用語でなければ not_it。",
  // 用語を獲得したときに Jev が選ぶ返し。それ以外はコードが返しを決める
  // このゲームの目的は「IT 用語をどんどん言わせる」こと。深掘りの質問はせず、
  // 用語への短いリアクション + まだ足りない分野のキーワードを促す返しにする。
  // リアクションの材料として、用語ごとに次の3つも一緒に Jev に聞く
  eraQuestion: "`word` は、今どのくらい現役の技術か。",
  eraLevels: [
    "今ではほとんど使われなくなった、懐かしい昔の技術",
    "全盛期は過ぎたが、今もまだ使われている古めの技術",
    "今も広く使われている定番の技術",
    "比較的新しく、今まさに注目されている技術",
  ],
  hardQuestion: "`word` は、習得が難しく学習コストが高いことで知られる技術か。",
  nicheQuestion: "`word` は、IT エンジニアの間でどれくらい通好みの用語か。",
  nicheLevels: ["誰でも聞いたことがある有名な用語", "エンジニアなら普通に知っている用語", "詳しい人しか使わない通好みの用語"],
  // 「DynamoDB → AWS」のように関連するだけのものまで当てないよう、名前そのものかを聞く
  triviaQuestion: "`word` そのものが、次のどの技術の名前か。音声認識の誤変換やカタカナ読みで崩れていても、意図された名前で判断する。その技術の一部や関連サービス（例: AWS の個別サービス）にすぎないなら none。",
  triviaThreshold: 0.7,
  askRate: 0.6, // 獲得時の返しに「まだ足りない分野のキーワード、何かある？」を足す確率
  ranks: [
    [0, "一般人"], [20, "ITに興味あり"], [40, "見習いエンジニア"],
    [60, "エンジニア"], [80, "シニアエンジニア"], [100, "IT博士"],
  ],
};

// ぽちょの表情。画像は web/faces/<id>.gif → .png の順で探し、無ければ絵文字を出す
export const FACES = {
  neutral:   { emoji: "🐻", label: "ふつう" },
  happy:     { emoji: "😊", label: "にっこり" },
  laugh:     { emoji: "😆", label: "大笑い" },
  surprised: { emoji: "😲", label: "びっくり" },
  sad:       { emoji: "😢", label: "しょんぼり" },
  angry:     { emoji: "😤", label: "ぷんぷん" },
  worried:   { emoji: "😟", label: "心配" },
  curious:   { emoji: "🤔", label: "きょうみしんしん" },
  impressed: { emoji: "🤩", label: "キラキラ" },
  calm:      { emoji: "😌", label: "なだめる" },
  doubt:     { emoji: "🧐", label: "うたがい" },
  cheer:     { emoji: "💪", label: "おうえん" },
};

export const REPLY_INSTRUCTIONS =
  "`conversation` は、IT が大好きな聞き手と相手の会話で、`latest` は相手の最新の発言。聞き手が `latest` に返す反応として、会話の流れに最も自然に合い、話を弾ませる種類はどれか。";

// Jev は「返しの種類」を Choice で選び、言い回しはコードが variants からランダムに選ぶ。
// 表情は種類ごとに固定（返しの言葉と表情がセット）。Choice は最大 255 種類まで。
export const INTENTS = [
  // IT博士チャレンジ用
  // {word} = 今回の用語、{cat} = その分野、{weak} = まだ足りない分野。コードが埋める
  { id: "tech_wow", desc: "用語を獲得した", face: "impressed", variants: ["{word}、いいね！", "おっ、{word}！", "{word}きた！{cat}＋1", "{word}、エンジニアっぽい！", "ナイス、{word}！"] },
  { id: "tech_multi", desc: "一度に複数の用語を獲得した", face: "impressed", variants: ["{word}！一気にきたね", "{word}、連続ヒット！", "たたみかけるね！{word}"] },
  { id: "tech_niche", desc: "通好みの用語を獲得した", face: "surprised", variants: ["{word}！なかなか出てこないやつだ", "渋い！{word}とは", "{word}が出るとは、通だね"] },
  { id: "tech_legacy", desc: "懐かしい昔の技術", face: "laugh", variants: ["{word}、懐かしい！そんなのもあったね", "{word}って、時代を感じるね", "出た、{word}！昔よく使ったなぁ"] },
  { id: "tech_still", desc: "古めだがまだ使われている技術", face: "surprised", variants: ["{word}、まだ現役なんだよね", "{word}って、まだ使われてるんだよね", "{word}、しぶとく生きてるよね"] },
  { id: "tech_new", desc: "新しく注目されている技術", face: "impressed", variants: ["{word}、今っぽい！", "最先端だね、{word}", "{word}、いま熱いよね"] },
  { id: "tech_hard", desc: "学習コストが高い技術", face: "worried", variants: ["{word}、学習コスト高かったよね", "{word}、覚えるの大変だったなぁ", "{word}で一度は泣くよね"] },
  { id: "tech_repeat", desc: "さっきと同じ用語の繰り返し", face: "doubt", variants: ["{word}はさっきも聞いたわ", "{word}、もう聞いたよ", "{word}の連呼じゃ博士になれないよ"] },
  { id: "too_generic", desc: "分野の名前そのものを言っただけ", face: "doubt", variants: ["「{word}」は分野の名前そのものだよ！", "{word}の中の、具体的な用語で！", "ざっくりすぎ！{word}の中身を教えて"] },
  { id: "cat_full", desc: "もう満タンの分野の用語だった", face: "calm", variants: ["{cat}はもう満タン！{weak}がらみで何かある？", "{cat}は十分！次は{weak}いこう", "{word}もいいけど、{weak}のキーワードが聞きたいな"] },
  { id: "tech_off", desc: "IT と関係ない話", face: "doubt", variants: ["それ、ITと関係ある？", "IT博士チャレンジ中だよ！", "{weak}がらみのキーワード、何か思いつく？", "例えば{weak}の用語とか！"] },
  // 質問
  { id: "why", desc: "理由や動機を聞き返す", face: "curious", variants: ["なんで？", "どうして？", "どうしてそう思ったの？", "理由を聞いてもいい？"] },
  { id: "detail", desc: "具体例や詳細を求める", face: "curious", variants: ["それって具体的にはどういうこと？", "例えば？", "もう少し詳しく教えて", "具体的に言うと？"] },
  { id: "then", desc: "話の続きや結果を促す", face: "curious", variants: ["それでどうなったの？", "その後は？", "続きが気になる", "で、で？"] },
  { id: "when_where", desc: "いつ・どこで・誰と、など状況を確かめる", face: "neutral", variants: ["いつの話？", "どこで？", "誰と？", "それっていつ頃？"] },
  { id: "feeling", desc: "相手がどう感じたかを聞く", face: "worried", variants: ["それ、どう感じた？", "そのとき、どんな気持ちだった？", "今はどう思ってる？"] },
  { id: "goal", desc: "結局どうしたいのか、本心や目的を聞く", face: "curious", variants: ["結局どうしたいの？", "本当はどうなってほしい？", "一番大事にしたいのは何？"] },
  // 共感
  { id: "empathy_hard", desc: "つらさや大変さに寄り添う", face: "sad", variants: ["それはつらいね", "それは大変だったね", "しんどかったね", "よく耐えたね"] },
  { id: "empathy_angry", desc: "相手の怒りや不満に同調する", face: "angry", variants: ["それはムカつくね", "そりゃ怒るよね", "それはひどい！", "無理もないよ"] },
  { id: "empathy_lonely", desc: "寂しさや悔しさに寄り添う", face: "sad", variants: ["寂しいね", "悔しいね", "それは切ないね"] },
  { id: "agree_light", desc: "軽くうなずいて話を聞く", face: "neutral", variants: ["うんうん", "なるほどね", "へぇ〜", "そうなんだ"] },
  // 驚き
  { id: "surprise", desc: "意外な話に驚く", face: "surprised", variants: ["えっ、そうなの！？", "まじで！？", "そんなことあるんだ", "うそでしょ", "そんな展開ある！？"] },
  // 称賛
  { id: "praise", desc: "相手の行動や成果を褒める", face: "impressed", variants: ["すごいじゃん！", "さすがだね", "よく頑張ったね", "最高じゃん", "それは誇っていいよ"] },
  { id: "praise_idea", desc: "発想やアイデアの鋭さに感心する", face: "impressed", variants: ["めちゃくちゃ面白い発想だね", "それは天才的", "視点が鋭い", "センスあるね"] },
  { id: "deep", desc: "本質を突いた深い話に唸る", face: "impressed", variants: ["深いね…", "それは本質を突いてる", "哲学的だね", "考えさせられるなぁ"] },
  // 笑い
  { id: "laugh", desc: "面白い話やボケに笑う", face: "laugh", variants: ["あはは、それは笑う", "ウケる", "面白すぎる", "想像したら笑っちゃった", "それはズルいｗ"] },
  // 興味
  { id: "interest", desc: "話に強い興味を示し、もっと聞きたがる", face: "happy", variants: ["それはなかなか面白い話ですね。もっと詳しく教えてください", "もっと聞かせて", "その話、興味あるなぁ", "それ、もう少し掘り下げたい"] },
  { id: "envy", desc: "楽しそうな話や美味しそうな話を羨ましがる", face: "happy", variants: ["いいなぁ、行ってみたい", "楽しそう！", "羨ましい", "おいしそう！"] },
  // なだめ
  { id: "calm_down", desc: "興奮や怒りを落ち着かせる", face: "calm", variants: ["まあまあ、落ち着いて", "一回深呼吸しよう", "気持ちはわかるけど、ちょっと冷静になろう"] },
  { id: "other_side", desc: "相手側にも事情があるかもと視点を変える", face: "calm", variants: ["相手にも事情があるのかも", "逆の立場から見るとどう？", "向こうはどう思ってるんだろうね"] },
  { id: "rest", desc: "疲れている相手に休息を勧める", face: "worried", variants: ["ちょっと休んだほうがいいかも", "無理しないでね", "今日は早めに寝よう"] },
  // 懐疑・反論
  { id: "doubt", desc: "話が大げさ・本当かどうか疑わしいと突っ込む", face: "doubt", variants: ["本当にそうかな？", "ちょっと盛ってない？", "話半分に聞いておくね", "根拠はあるの？"] },
  { id: "contradiction", desc: "以前の発言との矛盾を指摘する", face: "doubt", variants: ["それ、さっきと言ってること違わない？", "あれ、前と話が変わってない？"] },
  { id: "disagree", desc: "やんわり異なる意見を述べる", face: "doubt", variants: ["うーん、それはどうかな", "私は少し違う意見かも", "それは言い過ぎかも"] },
  { id: "agree_strong", desc: "意見にはっきり賛成する", face: "happy", variants: ["その通りだと思う", "一理あるね", "それは正論", "賛成！"] },
  // 励まし・助言
  { id: "cheer", desc: "不安な相手を励ます", face: "cheer", variants: ["大丈夫、なんとかなるよ", "応援してる", "あなたならできるよ", "次はきっとうまくいく"] },
  { id: "slow", desc: "焦っている相手に落ち着いて進むよう促す", face: "calm", variants: ["焦らなくていいよ", "一歩ずつでいいと思う", "まずは小さく試してみたら？"] },
  { id: "advice", desc: "整理や相談など具体的な進め方を提案する", face: "curious", variants: ["優先順位をつけてみよう", "紙に書き出してみたら？", "誰かに手伝ってもらうのは？", "一回寝かせてみるのもありかも"] },
  // 会話の運び
  { id: "greet", desc: "挨拶や会話の始まりに応じる", face: "happy", variants: ["こんにちは！今日はどんな話をする？", "やあ、元気？", "おつかれさま！"] },
  { id: "thanks", desc: "感謝や褒め言葉を受けてお礼を言う", face: "happy", variants: ["ありがとう、うれしい", "照れるなぁ", "そう言ってもらえると嬉しい"] },
  { id: "sorry", desc: "相手を怒らせた・傷つけたときに謝る", face: "sad", variants: ["ごめんね", "悪いこと言っちゃったかな", "気を悪くしたらごめん"] },
  { id: "summary", desc: "話が長い・散らかっているので要点を求める", face: "doubt", variants: ["結論から聞いてもいい？", "一言でまとめると？", "ちょっと話が飛んだ気がする"] },
  { id: "topic_change", desc: "話題が尽きたので別の話題を振る", face: "neutral", variants: ["話変わるけど、最近どう？", "そういえば、最近ハマってることある？", "ところで、今日は何してたの？"] },
  { id: "bye", desc: "会話の終わりや別れの挨拶に応じる", face: "happy", variants: ["またね！", "話せて楽しかった", "おやすみ〜"] },
];

// ---- デモ自動再生（http://localhost:8787/?demo）----
// プロモーション動画の撮影用。人がタイピングしているように1文字ずつ入力する。
// 各要素が1かたまり。後ろの数字はそのあと止まる時間（ミリ秒）
export const DEMO_SCRIPT = [
  ["今日はいい天気だね。", 1600],     // IT と関係ない →「それ、ITと関係ある？」
  ["データベース ", 1400],            // 分野名そのもの → 数えない
  ["AWS ", 1300],                     // 豆知識（請求書）
  ["Kubernetes ", 1300],              // 豆知識（k8s）→ クラウド満タン
  ["Lambda ", 1400],                  // 満タンの分野 →「〇〇がらみで何かある？」
  ["Oracle ", 1300],                  // 豆知識（Oracleマスター）
  ["DynamoDB ", 1300],                // → データベース満タン
  ["AWS ", 1400],                     // 既出 →「さっきも聞いたわ」
  ["DNS ", 1300],                     // 豆知識（だいたいDNS説）
  ["TCP ", 1300],                     // → ネットワーク満タン
  ["COBOL ", 1300],                   // 豆知識（勘定系）
  ["Rust ", 1300],                    // → プログラミング満タン
  ["ゼロトラスト ", 1300],            // 今っぽい
  ["WAF ", 2500],                     // → クリア
];
export const DEMO_KEY_MS = [60, 130]; // 1文字ごとの間隔（この範囲でランダム）

// ---- 豆知識 ----
// 有名な用語には、決め打ちの一言を用意しておく。どの用語かは Jev が Choice で選ぶので、
// 「モラクル」のように崩れていても当たる（生成ではなく、用意した候補から選ばせる）
export const TRIVIA = [
  { id: "oracle", name: "Oracle Database", lines: ["Oracleといえば、昔はOracleマスター持ってるだけで食べていけたよね", "Oracle、ライセンス費がすごかったなぁ"] },
  { id: "cobol", name: "COBOL", lines: ["COBOL、銀行の勘定系ではまだ現役らしいよ", "COBOLエンジニア、今でも引く手あまたなんだって"] },
  { id: "java", name: "Java", lines: ["Java、Write once, run anywhere！", "Java、ぬるぽで一度は泣くよね"] },
  { id: "jsp", name: "JSP / JSF（Java のサーバーサイド画面技術）", lines: ["JSP、懐かしい！まだ使われてるのかな", "JSF、懐かしいなぁ。そんなのもあったね"] },
  { id: "perl", name: "Perl", lines: ["Perl、CGI時代の主役だったね", "Perl、書いた本人も読めなくなるやつ"] },
  { id: "php", name: "PHP", lines: ["PHP、世界中のWebをいまだに支えてるよね"] },
  { id: "kubernetes", name: "Kubernetes", lines: ["Kubernetes、YAMLの海で溺れるやつ", "k8s、8文字省略するのがエンジニアっぽい"] },
  { id: "dns", name: "DNS", lines: ["障害の原因、だいたいDNS説", "It's always DNS."] },
  { id: "git", name: "Git", lines: ["git push -f は禁止ね", "Git、rebase で一度は事故るよね"] },
  { id: "rust", name: "Rust", lines: ["Rust、所有権で一度はコンパイラに怒られるよね"] },
  { id: "cassandra", name: "Apache Cassandra", lines: ["Cassandra、もとは Facebook 生まれなんだよね"] },
  { id: "vim", name: "Vim", lines: ["Vim、終わり方わかる？ :q! だよ"] },
  { id: "excel_vba", name: "Excel VBA", lines: ["VBA、日本の業務を裏で支えてるよね"] },
  { id: "aws", name: "AWS", lines: ["AWS、月末の請求書を見るのが怖いやつ"] },
  { id: "tcp", name: "TCP", lines: ["TCP、3ウェイハンドシェイク！"] },
];
