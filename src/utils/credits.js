import { createClient } from './supabase'

/**
 * Credit Management System
 * Handles checking and deducting credits for AI usage.
 */
export const creditManager = {
  // Costs in credits
  COSTS: {
    SCRIPT: 1,
    IMAGE: 5,
    VIDEO_VEO: 50,
  },

  async getBalance(userId) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()
    
    if (error) throw error
    return data.credits
  },

  async deductCredits(userId, amount, action = 'ai_usage', referenceId = null) {
    const supabase = createClient()
    
    // We use a RPC (Stored Procedure) to ensure atomic decrement
    const { data, error } = await supabase.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount: amount
    })

    if (error) throw new Error("Insufficient credits or database error")

    // Log the transaction
    await supabase
      .from('credit_transactions')
      .insert([{
        user_id: userId,
        amount: -amount, // Negative for deduction
        action: action,
        reference_id: referenceId
      }]);

    return data
  }
}
