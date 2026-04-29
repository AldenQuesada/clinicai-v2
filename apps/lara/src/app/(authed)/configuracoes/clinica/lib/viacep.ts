/**
 * ViaCEP lookup · port de fetchCEP em clinic-settings.js (linhas 36-56).
 * Retorna campos resolvidos ou null quando CEP invalido / api falhou.
 */

export interface ViaCepResult {
  rua: string
  bairro: string
  cidade: string
  estado: string
}

export async function fetchCEP(cep: string): Promise<ViaCepResult | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      erro?: boolean
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }
    if (data.erro) return null
    return {
      rua: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade || '',
      estado: data.uf || '',
    }
  } catch {
    return null
  }
}
