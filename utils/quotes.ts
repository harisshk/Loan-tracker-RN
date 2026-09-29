// Curated list of financial wisdom, wealth creation, debt freedom, and money psychology quotes

export interface FinancialQuote {
  id: string;
  quote: string;
  author: string;
  category:
    | "Debt-Free"
    | "Wealth"
    | "Discipline"
    | "Mindset"
    | "Investing"
    | "Freedom";
}

export const FINANCIAL_QUOTES: FinancialQuote[] = [
  {
    id: "q1",
    quote:
      "Do not save what is left after spending, but spend what is left after saving.",
    author: "Warren Buffett",
    category: "Discipline",
  },
  {
    id: "q2",
    quote:
      "A budget is telling your money where to go instead of wondering where it went.",
    author: "Dave Ramsey",
    category: "Debt-Free",
  },
  {
    id: "q3",
    quote:
      "Wealth is what you don't see. It is cars not purchased, watches not worn, and first-class upgrades declined.",
    author: "Morgan Housel",
    category: "Wealth",
  },
  {
    id: "q4",
    quote: "Beware of little expenses; a small leak will sink a great ship.",
    author: "Benjamin Franklin",
    category: "Discipline",
  },
  {
    id: "q5",
    quote:
      "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.",
    author: "Albert Einstein",
    category: "Investing",
  },
  {
    id: "q6",
    quote:
      "Financial peace isn't the acquisition of stuff. It's learning to live on less than you make.",
    author: "Dave Ramsey",
    category: "Freedom",
  },
  {
    id: "q7",
    quote:
      "True wealth is the ability to fully experience life on your own terms, free of financial worry.",
    author: "Naval Ravikant",
    category: "Freedom",
  },
  {
    id: "q8",
    quote: "The rich invest in time, the poor invest in money.",
    author: "Warren Buffett",
    category: "Mindset",
  },
  {
    id: "q9",
    quote: "Money is a terrible master but an excellent servant.",
    author: "P.T. Barnum",
    category: "Mindset",
  },
  {
    id: "q10",
    quote:
      "Every rupee paid towards debt principal is a guaranteed return on your future freedom.",
    author: "Financial Principle",
    category: "Debt-Free",
  },
  {
    id: "q11",
    quote:
      "The habit of saving is itself an education; it fosters every virtue and teaches self-denial.",
    author: "T.T. Munger",
    category: "Discipline",
  },
  {
    id: "q12",
    quote:
      "Spending money to show people how much money you have is the fastest way to have less money.",
    author: "Morgan Housel",
    category: "Mindset",
  },
  {
    id: "q13",
    quote:
      "It's not how much money you make, but how much money you keep and how hard it works for you.",
    author: "Robert Kiyosaki",
    category: "Wealth",
  },
  {
    id: "q14",
    quote:
      "Debt is the slavery of the free. Repay early to claim back your peace of mind.",
    author: "Publilius Syrus",
    category: "Debt-Free",
  },
  {
    id: "q15",
    quote:
      "The greatest reward of wealth isn't what it buys, but the independence and autonomy it grants.",
    author: "Morgan Housel",
    category: "Freedom",
  },
  {
    id: "q16",
    quote: "An investment in knowledge pays the best interest.",
    author: "Benjamin Franklin",
    category: "Investing",
  },
  {
    id: "q17",
    quote: "Never spend your money before you have earned it.",
    author: "Thomas Jefferson",
    category: "Discipline",
  },
  {
    id: "q18",
    quote:
      "Clear your high-interest debts first—it's like earning an instant risk-free return.",
    author: "Financial Wisdom",
    category: "Debt-Free",
  },
  {
    id: "q19",
    quote:
      "Someone's sitting in the shade today because someone planted a tree a long time ago.",
    author: "Warren Buffett",
    category: "Investing",
  },
  {
    id: "q20",
    quote:
      "Simplicity in financial life brings clarity, peace of mind, and lasting freedom.",
    author: "Naval Ravikant",
    category: "Freedom",
  },
  {
    id: "q21",
    quote:
      "If you buy things you do not need, soon you will have to sell things you need.",
    author: "Warren Buffett",
    category: "Discipline",
  },
  {
    id: "q22",
    quote: "The goal isn't more money. The goal is living life on your terms.",
    author: "Chris Brogan",
    category: "Freedom",
  },
  {
    id: "q23",
    quote: "Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.",
    author: "Warren Buffett",
    category: "Investing",
  },
  {
    id: "q24",
    quote:
      "You must gain control over your money or the lack of it will forever control you.",
    author: "Dave Ramsey",
    category: "Debt-Free",
  },
  {
    id: "q25",
    quote:
      "Financial independence is not about being rich; it is having sufficient resources to live with dignity.",
    author: "Naval Ravikant",
    category: "Wealth",
  },
];

/**
 * Returns a consistent daily quote based on the current calendar date (UTC/local date string hash)
 */
export function getDailyQuote(): FinancialQuote {
  if (!FINANCIAL_QUOTES || FINANCIAL_QUOTES.length === 0) {
    return {
      id: "default",
      quote:
        "Do not save what is left after spending, but spend what is left after saving.",
      author: "Warren Buffett",
      category: "Discipline",
    };
  }

  const now = new Date();
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash << 5) - hash + dateKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % FINANCIAL_QUOTES.length;
  return FINANCIAL_QUOTES[index];
}

/**
 * Returns the next quote sequentially or randomly, excluding the current one
 */
export function getNextQuote(currentId?: string): FinancialQuote {
  if (!FINANCIAL_QUOTES || FINANCIAL_QUOTES.length === 0) {
    return getDailyQuote();
  }

  const currentIndex = FINANCIAL_QUOTES.findIndex((q) => q.id === currentId);
  if (currentIndex === -1) {
    return FINANCIAL_QUOTES[0];
  }
  const nextIndex = (currentIndex + 1) % FINANCIAL_QUOTES.length;
  return FINANCIAL_QUOTES[nextIndex];
}

/**
 * Returns a random quote different from the current one
 */
export function getRandomQuote(excludeId?: string): FinancialQuote {
  if (!FINANCIAL_QUOTES || FINANCIAL_QUOTES.length === 0) {
    return getDailyQuote();
  }

  const pool = excludeId
    ? FINANCIAL_QUOTES.filter((q) => q.id !== excludeId)
    : FINANCIAL_QUOTES;
  const targetPool = pool.length > 0 ? pool : FINANCIAL_QUOTES;
  const index = Math.floor(Math.random() * targetPool.length);
  return targetPool[index] || FINANCIAL_QUOTES[0];
}

export interface CategoryTheme {
  bg: string;
  text: string;
}

/**
 * Returns customized tag styling colors based on the quote's financial category
 */
export function getCategoryTheme(
  category?: FinancialQuote["category"],
): CategoryTheme {
  switch (category) {
    case "Debt-Free":
      return { bg: "rgba(16, 185, 129, 0.12)", text: "#059669" };
    case "Wealth":
      return { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706" };
    case "Investing":
      return { bg: "rgba(14, 165, 233, 0.12)", text: "#0284c7" };
    case "Freedom":
      return { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed" };
    case "Discipline":
      return { bg: "rgba(244, 63, 94, 0.12)", text: "#e11d48" };
    case "Mindset":
      return { bg: "rgba(99, 102, 241, 0.12)", text: "#4f46e5" };
    default:
      return { bg: "rgba(15, 23, 42, 0.06)", text: "#475569" };
  }
}
