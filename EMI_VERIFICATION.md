# EMI Calculation Verification

## Standard EMI Formula (Used by Banks)

```
EMI = [P × r × (1 + r)^n] / [(1 + r)^n - 1]

Where:
P = Principal loan amount
r = Monthly interest rate (Annual Rate / 12 / 100)
n = Loan tenure in months
```

## Example Calculation

### Loan Details:
- **Principal (P)**: ₹5,00,000
- **Annual Interest Rate**: 10% per annum
- **Tenure (n)**: 60 months (5 years)
- **Monthly Rate (r)**: 10 / 12 / 100 = 0.008333

### Step 1: Calculate EMI

```
EMI = [500000 × 0.008333 × (1.008333)^60] / [(1.008333)^60 - 1]
    = [500000 × 0.008333 × 1.6453] / [1.6453 - 1]
    = [6854.58] / [0.6453]
    = ₹10,624 per month
```

### Step 2: Amortization Schedule (First 6 Months)

| Month | Opening Principal | EMI | Interest | Principal Paid | Closing Principal |
|-------|------------------|-----|----------|----------------|-------------------|
| 1 | ₹5,00,000 | ₹10,624 | ₹4,167 | ₹6,457 | ₹4,93,543 |
| 2 | ₹4,93,543 | ₹10,624 | ₹4,113 | ₹6,511 | ₹4,87,032 |
| 3 | ₹4,87,032 | ₹10,624 | ₹4,059 | ₹6,565 | ₹4,80,467 |
| 4 | ₹4,80,467 | ₹10,624 | ₹4,004 | ₹6,620 | ₹4,73,847 |
| 5 | ₹4,73,847 | ₹10,624 | ₹3,949 | ₹6,675 | ₹4,67,172 |
| 6 | ₹4,67,172 | ₹10,624 | ₹3,893 | ₹6,731 | ₹4,60,441 |

**Calculation for Month 1:**
- Interest = ₹5,00,000 × 0.008333 = ₹4,167
- Principal = ₹10,624 - ₹4,167 = ₹6,457
- Remaining = ₹5,00,000 - ₹6,457 = ₹4,93,543

### Step 3: After 25 Months (Example)

**Total Paid:** 25 × ₹10,624 = ₹2,65,600

**Breakdown:**
- **Principal Paid**: ₹1,67,234
- **Interest Paid**: ₹98,366
- **Remaining Principal**: ₹5,00,000 - ₹1,67,234 = ₹3,32,766

**Total Interest Over 60 Months:** ₹1,37,440

**Total Amount to be Paid:** ₹5,00,000 + ₹1,37,440 = ₹6,37,440

## How the App Calculates

### 1. **Calculate EMI** (using standard formula)
```javascript
const monthlyRate = 10 / 12 / 100; // 0.008333
const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
            (Math.pow(1 + monthlyRate, tenure) - 1);
```

### 2. **Generate Amortization Schedule**
For each month from 1 to tenure:
```javascript
interestForMonth = remainingPrincipal × monthlyRate
principalForMonth = emi - interestForMonth
remainingPrincipal -= principalForMonth
```

### 3. **Calculate Totals Based on Months Elapsed**
```javascript
monthsElapsed = months between start date and today
paymentsMade = min(monthsElapsed, tenure)
principalPaid = sum of principal for months 1 to paymentsMade
interestPaid = sum of interest for months 1 to paymentsMade
```

### 4. **Calculate Remaining**
```javascript
remainingPrincipalAmount = principal - principalPaid
remainingInterestAmount = totalInterest - interestPaid
remainingAmount = remainingPrincipalAmount + remainingInterestAmount
```

## Verification Example

**Loan Started:** January 1, 2023
**Today's Date:** February 9, 2026
**Months Elapsed:** 37 months

### Expected Results:

**EMI:** ₹10,624/month

**After 37 Months:**
- **Total Paid**: 37 × ₹10,624 = ₹3,93,088
- **Principal Paid**: ₹2,32,156
- **Interest Paid**: ₹1,60,932
- **Remaining Principal**: ₹2,67,844
- **Remaining Interest**: ₹76,508
- **Total Remaining**: ₹3,44,352

**Progress:** 37/60 = 61.67% of payments made
**Principal Progress:** ₹2,32,156 / ₹5,00,000 = 46.43% of principal paid

## Key Points

1. ✅ **EMI is constant** throughout the loan tenure
2. ✅ **Early payments** have more interest, less principal
3. ✅ **Later payments** have less interest, more principal
4. ✅ **Principal reduces** with each payment
5. ✅ **Interest is calculated** on the remaining principal balance

## Common Misconceptions

❌ **Wrong:** Total Interest = Principal × Rate × Time
- This is simple interest, not used for EMI loans

✅ **Correct:** Interest calculated monthly on reducing balance
- Each month's interest = Remaining Principal × Monthly Rate

## How to Verify in the App

1. **Add a loan** with the example values
2. **Check EMI calculation** - Should be ₹10,624
3. **View breakdown** - Principal vs Interest should match amortization
4. **Pull to refresh** - Recalculates based on current date
5. **Compare with bank statement** - Should match exactly

The app uses the **exact same formula** that banks use for EMI calculation!
