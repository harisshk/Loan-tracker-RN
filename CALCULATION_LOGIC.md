# EMI Breakdown Calculation - Principal vs Interest

## Overview

The app now uses **proper EMI amortization** to calculate how each payment is split between principal and interest. This is the standard method used by banks and financial institutions.

## How EMI Works

### EMI Formula
```
EMI = [P × r × (1 + r)^n] / [(1 + r)^n - 1]

Where:
P = Principal loan amount
r = Monthly interest rate (annual rate / 12 / 100)
n = Tenure in months
```

### Key Concept: Amortization

In an EMI:
- **Early payments** have more interest, less principal
- **Later payments** have less interest, more principal
- **Total EMI amount** stays the same throughout

## Example Calculation

**Loan Details:**
- Principal: ₹5,00,000
- Annual Interest: 10%
- Tenure: 60 months

**Calculated EMI:** ₹10,624 per month

### Month-by-Month Breakdown (First 3 months):

**Month 1:**
- EMI: ₹10,624
- Interest: ₹4,167 (₹5,00,000 × 10% / 12)
- Principal: ₹6,457 (₹10,624 - ₹4,167)
- Remaining: ₹4,93,543

**Month 2:**
- EMI: ₹10,624
- Interest: ₹4,113 (₹4,93,543 × 10% / 12)
- Principal: ₹6,511
- Remaining: ₹4,87,032

**Month 3:**
- EMI: ₹10,624
- Interest: ₹4,058
- Principal: ₹6,566
- Remaining: ₹4,80,466

### After 25 Months (Example):

**Total Paid:** ₹2,65,600
- **Principal Paid:** ₹1,67,234
- **Interest Paid:** ₹98,366

**Remaining:** ₹3,69,866
- **Principal Remaining:** ₹3,32,766
- **Interest Remaining:** ₹37,100

## What the App Shows

### Dashboard
- **Total Outstanding**: Sum of all remaining balances (principal + interest)
- **Total Paid**: Actual amount paid across all loans (principal + interest)
- **Upcoming EMI**: Sum of calculated EMIs for active loans

### Loan Detail Screen

**1. Total Loan Amount Card**
- Shows principal and total interest over full tenure

**2. Total Paid Till Now Card**
- **Total Paid**: Sum of all EMI payments made
- **Principal Paid**: How much of principal has been repaid
- **Interest Paid**: How much interest has been paid

**3. Total Loan Breakdown Chart**
- Bar chart showing principal vs interest in the total loan

**4. Amount Paid Breakdown Chart**
- Bar chart showing how paid amount splits into principal and interest

**5. Payment Progress**
- Visual progress bar
- EMIs paid vs remaining

**6. EMI Details**
- Calculated EMI amount (using proper formula)
- Interest rate per annum
- Total paid and remaining balance

## Benefits of Proper Calculation

✅ **Accurate Interest Tracking**: Know exactly how much interest you're paying
✅ **Principal Reduction**: See how much of your actual debt is being paid off
✅ **Better Planning**: Understand your loan payoff trajectory
✅ **Real EMI Amount**: Calculated using the standard banking formula
✅ **Transparent Breakdown**: See exactly where your money goes

## Difference from Simple Interest

**Simple Interest (Old Method):**
```
Total Interest = Principal × Rate × Time
```
This doesn't account for reducing principal balance.

**Amortization (New Method):**
- Interest calculated on **remaining balance** each month
- Principal portion increases over time
- More accurate and matches real-world loans

## Technical Implementation

The app uses the `calculateEMIBreakdown` function in `utils/emiCalculator.js` which:

1. Calculates monthly EMI using the standard formula
2. Generates an amortization schedule for the entire tenure
3. Tracks principal and interest for each month
4. Sums up totals based on months elapsed
5. Returns comprehensive breakdown data

This ensures all calculations match what you would see in a real bank statement!
