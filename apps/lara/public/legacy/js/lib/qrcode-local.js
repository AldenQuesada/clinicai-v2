;(function (global) {
  'use strict'

  const QRLocal = (() => {

    // ─── GF(256) Arithmetic ──────────────────────────────────────────────────
    const GF_POLY = 0x11D
    const exp = new Uint8Array(512)
    const log = new Uint8Array(256)

    ;(() => {
      let x = 1
      for (let i = 0; i < 255; i++) {
        exp[i] = x
        log[x] = i
        x <<= 1
        if (x & 256) x ^= GF_POLY
      }
      for (let i = 255; i < 512; i++) exp[i] = exp[i - 255]
    })()

    function gfMul(a, b) {
      if (a === 0 || b === 0) return 0
      return exp[(log[a] + log[b]) % 255]
    }

    function gfPow(a, n) {
      return exp[(log[a] * n) % 255]
    }

    // ─── Reed-Solomon ────────────────────────────────────────────────────────
    function rsGeneratorPoly(nEC) {
      let g = [1]
      for (let i = 0; i < nEC; i++) {
        const factor = [1, gfPow(2, i)]
        const result = new Array(g.length + factor.length - 1).fill(0)
        for (let j = 0; j < g.length; j++) {
          for (let k = 0; k < factor.length; k++) {
            result[j + k] ^= gfMul(g[j], factor[k])
          }
        }
        g = result
      }
      return g
    }

    function rsEncode(data, nEC) {
      const gen = rsGeneratorPoly(nEC)
      const msg = data.slice()
      for (let i = 0; i < nEC; i++) msg.push(0)
      for (let i = 0; i < data.length; i++) {
        const coef = msg[i]
        if (coef !== 0) {
          for (let j = 1; j < gen.length; j++) {
            msg[i + j] ^= gfMul(gen[j], coef)
          }
        }
      }
      return msg.slice(data.length)
    }

    // ─── ECC Capacity Table (Byte mode, ECC M) ───────────────────────────────
    // Each entry: [ [g1count, g1data, g1ec], [g2count, g2data, g2ec] ]
    // g2 may be null
    const ECC_M = [
      null, // index 0 unused
      [[1, 16, 10], null],           // v1
      [[1, 28, 16], null],           // v2
      [[1, 44, 26], null],           // v3
      [[2, 32, 18], null],           // v4
      [[2, 43, 24], null],           // v5
      [[4, 27, 16], null],           // v6
      [[4, 31, 18], null],           // v7
      [[2, 38, 22], [2, 39, 22]],    // v8
      [[3, 36, 22], [2, 37, 22]],    // v9
      [[4, 43, 26], [1, 44, 26]],    // v10
      [[1, 50, 30], [4, 51, 30]],    // v11
      [[6, 36, 22], [2, 37, 22]],    // v12
      [[8, 37, 22], [1, 38, 22]],    // v13
      [[4, 40, 24], [5, 41, 24]],    // v14
      [[5, 41, 24], [5, 42, 24]],    // v15
    ]

    function getCapacity(version) {
      const entry = ECC_M[version]
      let total = 0
      for (const g of entry) {
        if (g) total += g[0] * g[1]
      }
      return total
    }

    function selectVersion(byteLen) {
      for (let v = 1; v <= 15; v++) {
        // overhead: mode (4 bits) + char count (8 bits for v1-9, else 16) + terminator
        const ccBits = v <= 9 ? 8 : 16
        const headerBits = 4 + ccBits
        const dataBits = getCapacity(v) * 8
        if (dataBits >= headerBits + byteLen * 8) return v
      }
      throw new Error('QRLocal: data too long for version 1-15')
    }

    // ─── Data Encoding ────────────────────────────────────────────────────────
    function encodeData(text, version) {
      const bytes = []
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c > 0xFF) {
          // UTF-8 encode
          if (c < 0x800) {
            bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
          } else {
            bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
          }
        } else {
          bytes.push(c)
        }
      }

      const ccBits = version <= 9 ? 8 : 16
      const totalDataBits = getCapacity(version) * 8
      const bits = []

      // Mode: byte = 0100
      bits.push(0, 1, 0, 0)

      // Character count
      const len = bytes.length
      for (let i = ccBits - 1; i >= 0; i--) bits.push((len >> i) & 1)

      // Data bytes
      for (const b of bytes) {
        for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1)
      }

      // Terminator (up to 4 zeros)
      const remaining = totalDataBits - bits.length
      const term = Math.min(4, remaining)
      for (let i = 0; i < term; i++) bits.push(0)

      // Pad to byte boundary
      while (bits.length % 8 !== 0) bits.push(0)

      // Pad bytes
      const padBytes = [0xEC, 0x11]
      let pi = 0
      while (bits.length < totalDataBits) {
        const pb = padBytes[pi % 2]
        for (let i = 7; i >= 0; i--) bits.push((pb >> i) & 1)
        pi++
      }

      // Convert to byte array
      const dataBytes = []
      for (let i = 0; i < bits.length; i += 8) {
        let b = 0
        for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
        dataBytes.push(b)
      }

      return { bytes, dataBytes }
    }

    // ─── Block Interleaving ───────────────────────────────────────────────────
    function buildCodewords(dataBytes, version) {
      const entry = ECC_M[version]
      const groups = entry.filter(Boolean)

      // Split data into blocks
      const blocks = []
      let offset = 0
      for (const [count, dLen, ecLen] of groups) {
        for (let b = 0; b < count; b++) {
          blocks.push({
            data: dataBytes.slice(offset, offset + dLen),
            ec: [],
            ecLen,
          })
          offset += dLen
        }
      }

      // Compute RS EC codewords for each block
      for (const blk of blocks) {
        blk.ec = rsEncode(blk.data, blk.ecLen)
      }

      // Interleave data codewords
      const maxData = Math.max(...blocks.map(b => b.data.length))
      const result = []
      for (let i = 0; i < maxData; i++) {
        for (const blk of blocks) {
          if (i < blk.data.length) result.push(blk.data[i])
        }
      }

      // Interleave EC codewords
      const maxEC = Math.max(...blocks.map(b => b.ec.length))
      for (let i = 0; i < maxEC; i++) {
        for (const blk of blocks) {
          if (i < blk.ec.length) result.push(blk.ec[i])
        }
      }

      return result
    }

    // ─── Matrix Dimensions ───────────────────────────────────────────────────
    function matSize(version) {
      return 17 + 4 * version
    }

    function makeMatrix(size) {
      return Array.from({ length: size }, () => new Int8Array(size).fill(-1))
    }

    // ─── Finder Patterns ─────────────────────────────────────────────────────
    // value: 1=dark, 0=light
    function placeFinder(mat, row, col) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6
          const onInner = r >= 2 && r <= 4 && c >= 2 && c <= 4
          mat[row + r][col + c] = (onBorder || onInner) ? 1 : 0
        }
      }
    }

    function placeSeparators(mat, size) {
      // Top-left
      for (let i = 0; i < 8; i++) {
        if (mat[7][i] === -1) mat[7][i] = 0
        if (mat[i][7] === -1) mat[i][7] = 0
      }
      // Top-right
      for (let i = 0; i < 8; i++) {
        if (mat[7][size - 1 - i] === -1) mat[7][size - 1 - i] = 0
        if (mat[i][size - 8] === -1) mat[i][size - 8] = 0
      }
      // Bottom-left
      for (let i = 0; i < 8; i++) {
        if (mat[size - 8][i] === -1) mat[size - 8][i] = 0
        if (mat[size - 1 - i][7] === -1) mat[size - 1 - i][7] = 0
      }
    }

    // ─── Alignment Patterns ───────────────────────────────────────────────────
    const ALIGN_POS = [
      [],           // v1
      [6, 18],      // v2
      [6, 22],      // v3
      [6, 26],      // v4
      [6, 30],      // v5
      [6, 34],      // v6
      [6, 22, 38],  // v7
      [6, 24, 42],  // v8
      [6, 26, 46],  // v9
      [6, 28, 50],  // v10
      [6, 30, 54],  // v11
      [6, 32, 58],  // v12
      [6, 34, 62],  // v13
      [6, 26, 46, 66], // v14
      [6, 26, 48, 70], // v15
    ]

    function placeAlignments(mat, version) {
      const pos = ALIGN_POS[version - 1]
      if (!pos || pos.length === 0) return
      for (const r of pos) {
        for (const c of pos) {
          // Skip positions that overlap with finder patterns
          if (mat[r][c] !== -1) continue
          // 5x5 alignment pattern
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const onBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2
              const isCenter = dr === 0 && dc === 0
              mat[r + dr][c + dc] = (onBorder || isCenter) ? 1 : 0
            }
          }
        }
      }
    }

    // ─── Timing Patterns ─────────────────────────────────────────────────────
    function placeTiming(mat, size) {
      for (let i = 8; i < size - 8; i++) {
        const v = (i % 2 === 0) ? 1 : 0
        if (mat[6][i] === -1) mat[6][i] = v
        if (mat[i][6] === -1) mat[i][6] = v
      }
    }

    // ─── Dark Module ──────────────────────────────────────────────────────────
    function placeDarkModule(mat, version) {
      mat[4 * version + 9][8] = 1
    }

    // ─── Format Info Reservation ─────────────────────────────────────────────
    function reserveFormat(mat, size) {
      // Reserve format info areas with a sentinel value (2)
      // Top-left horizontal
      for (let i = 0; i < 9; i++) if (mat[8][i] === -1) mat[8][i] = 2
      // Top-left vertical
      for (let i = 0; i < 9; i++) if (mat[i][8] === -1) mat[i][8] = 2
      // Top-right horizontal
      for (let i = size - 8; i < size; i++) if (mat[8][i] === -1) mat[8][i] = 2
      // Bottom-left vertical
      for (let i = size - 7; i < size; i++) if (mat[i][8] === -1) mat[i][8] = 2
    }

    // ─── Version Info Reservation (v7+) ──────────────────────────────────────
    function reserveVersion(mat, size) {
      // Top-right 6x3 block
      for (let r = 0; r < 6; r++) {
        for (let c = size - 11; c < size - 8; c++) {
          if (mat[r][c] === -1) mat[r][c] = 2
        }
      }
      // Bottom-left 3x6 block
      for (let r = size - 11; r < size - 8; r++) {
        for (let c = 0; c < 6; c++) {
          if (mat[r][c] === -1) mat[r][c] = 2
        }
      }
    }

    // ─── Data Placement ───────────────────────────────────────────────────────
    function placeData(mat, size, codewords) {
      let bitIdx = 0
      let totalBits = codewords.length * 8
      let goingUp = true

      // Iterate through 2-column strips from right to left, skipping col 6
      for (let colRight = size - 1; colRight >= 1; colRight -= 2) {
        if (colRight === 6) colRight-- // skip timing column

        for (let i = 0; i < size; i++) {
          const row = goingUp ? (size - 1 - i) : i
          for (let dc = 0; dc <= 1; dc++) {
            const col = colRight - dc
            if (mat[row][col] === -1) {
              let bit = 0
              if (bitIdx < totalBits) {
                const byteIdx = Math.floor(bitIdx / 8)
                const bitPos = 7 - (bitIdx % 8)
                bit = (codewords[byteIdx] >> bitPos) & 1
                bitIdx++
              }
              mat[row][col] = bit
            }
          }
        }
        goingUp = !goingUp
      }
    }

    // ─── BCH Format Info ─────────────────────────────────────────────────────
    // BCH(15,5) generator: 10100110111 = 0x537
    function bchFormat(data) {
      // data is 5 bits (eccBits<<3 | maskNum)
      let rem = data << 10
      const gen = 0x537
      for (let i = 14; i >= 10; i--) {
        if ((rem >> i) & 1) rem ^= gen << (i - 10)
      }
      return rem & 0x3FF
    }

    function formatInfo(maskNum) {
      // ECC M = 00, mask = maskNum
      const data = (0b00 << 3) | maskNum
      const bch = bchFormat(data)
      const raw = (data << 10) | bch
      return raw ^ 0x5412
    }

    // ─── BCH Version Info ─────────────────────────────────────────────────────
    // BCH(18,6) generator: 0x1F25
    function bchVersion(data) {
      let rem = data << 12
      const gen = 0x1F25
      for (let i = 17; i >= 12; i--) {
        if ((rem >> i) & 1) rem ^= gen << (i - 12)
      }
      return rem & 0xFFF
    }

    function versionInfo(version) {
      return (version << 12) | bchVersion(version)
    }

    // ─── Apply Format Info ────────────────────────────────────────────────────
    function applyFormat(mat, size, maskNum) {
      const fi = formatInfo(maskNum)
      // 15 bits, bit 14 is MSB
      const bits = []
      for (let i = 14; i >= 0; i--) bits.push((fi >> i) & 1)

      // Top-left: horizontal strip (col 0-8, row 8), skip col 6
      const hPos = [0,1,2,3,4,5,7,8]
      for (let i = 0; i < 8; i++) mat[8][hPos[i]] = bits[i]

      // Top-left: vertical strip (row 0-8, col 8), skip row 6
      const vPos = [7,5,4,3,2,1,0]
      mat[8][8] = bits[7] // not skipped here — this is the corner
      for (let i = 0; i < 7; i++) mat[vPos[i]][8] = bits[8 + i]

      // Top-right: row 8, cols (size-8)..(size-1)
      for (let i = 0; i < 8; i++) mat[8][size - 1 - i] = bits[14 - i]

      // Bottom-left: col 8, rows (size-7)..(size-1)
      for (let i = 0; i < 7; i++) mat[size - 7 + i][8] = bits[i]
    }

    // ─── Apply Version Info (v7+) ─────────────────────────────────────────────
    function applyVersion(mat, size, version) {
      if (version < 7) return
      const vi = versionInfo(version)
      // 18 bits, placed in 6x3 blocks
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1
        const r = Math.floor(i / 3)
        const c = i % 3
        // Top-right block
        mat[r][size - 11 + c] = bit
        // Bottom-left block
        mat[size - 11 + c][r] = bit
      }
    }

    // ─── Masking ──────────────────────────────────────────────────────────────
    const MASK_FN = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ]

    function applyMask(mat, size, maskNum) {
      const fn = MASK_FN[maskNum]
      const result = mat.map(row => row.slice())
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (result[r][c] !== 0 && result[r][c] !== 1) continue
          // Only mask data modules (not function patterns)
          if (fn(r, c)) result[r][c] ^= 1
        }
      }
      return result
    }

    // ─── Penalty Score ────────────────────────────────────────────────────────
    function penaltyScore(mat, size) {
      let score = 0

      // Rule 1: 5+ consecutive same-color in row/col
      for (let r = 0; r < size; r++) {
        let run = 1
        for (let c = 1; c < size; c++) {
          if (mat[r][c] === mat[r][c - 1]) {
            run++
            if (run === 5) score += 3
            else if (run > 5) score += 1
          } else {
            run = 1
          }
        }
      }
      for (let c = 0; c < size; c++) {
        let run = 1
        for (let r = 1; r < size; r++) {
          if (mat[r][c] === mat[r - 1][c]) {
            run++
            if (run === 5) score += 3
            else if (run > 5) score += 1
          } else {
            run = 1
          }
        }
      }

      // Rule 2: 2x2 same-color blocks
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = mat[r][c]
          if (v === mat[r][c + 1] && v === mat[r + 1][c] && v === mat[r + 1][c + 1]) {
            score += 3
          }
        }
      }

      // Rule 3: finder-like patterns (1,0,1,1,1,0,1 with 4 zeros on either side)
      const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
      const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
      for (let r = 0; r < size; r++) {
        for (let c = 0; c <= size - 11; c++) {
          let m1 = true, m2 = true
          for (let i = 0; i < 11; i++) {
            if (mat[r][c + i] !== pat1[i]) m1 = false
            if (mat[r][c + i] !== pat2[i]) m2 = false
          }
          if (m1 || m2) score += 40
        }
      }
      for (let c = 0; c < size; c++) {
        for (let r = 0; r <= size - 11; r++) {
          let m1 = true, m2 = true
          for (let i = 0; i < 11; i++) {
            if (mat[r + i][c] !== pat1[i]) m1 = false
            if (mat[r + i][c] !== pat2[i]) m2 = false
          }
          if (m1 || m2) score += 40
        }
      }

      // Rule 4: proportion of dark modules
      let dark = 0
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (mat[r][c] === 1) dark++
        }
      }
      const pct = dark / (size * size)
      const prev5 = Math.floor(pct * 20) * 5
      const next5 = prev5 + 5
      score += Math.min(Math.abs(prev5 - 50), Math.abs(next5 - 50)) * 2

      return score
    }

    // ─── Build Full QR Matrix ─────────────────────────────────────────────────
    function buildMatrix(version, codewords) {
      const size = matSize(version)
      const mat = makeMatrix(size)

      // Place function patterns
      placeFinder(mat, 0, 0)
      placeFinder(mat, 0, size - 7)
      placeFinder(mat, size - 7, 0)
      placeSeparators(mat, size)
      placeAlignments(mat, version)
      placeTiming(mat, size)
      placeDarkModule(mat, version)
      reserveFormat(mat, size)
      if (version >= 7) reserveVersion(mat, size)

      // Place data
      placeData(mat, size, codewords)

      // Try all 8 masks, pick best
      let bestMask = 0
      let bestScore = Infinity
      let bestMat = null

      for (let m = 0; m < 8; m++) {
        const masked = applyMask(mat, size, m)
        applyFormat(masked, size, m)
        if (version >= 7) applyVersion(masked, size, version)
        const s = penaltyScore(masked, size)
        if (s < bestScore) {
          bestScore = s
          bestMask = m
          bestMat = masked
        }
      }

      return bestMat
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    function renderCanvas(canvas, mat, opts) {
      const size = mat.length
      const options = Object.assign({ size: 140, quiet: 4 }, opts)
      const { quiet } = options
      const totalModules = size + quiet * 2
      const moduleSize = options.size / totalModules

      canvas.width = options.size
      canvas.height = options.size

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, options.size, options.size)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, options.size, options.size)
      ctx.fillStyle = '#000000'

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (mat[r][c] === 1) {
            const x = (c + quiet) * moduleSize
            const y = (r + quiet) * moduleSize
            ctx.fillRect(
              Math.floor(x),
              Math.floor(y),
              Math.ceil(moduleSize),
              Math.ceil(moduleSize)
            )
          }
        }
      }
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    function generate(text, opts) {
      const encoder = new TextEncoder()
      const byteLen = encoder.encode(text).length
      const version = selectVersion(byteLen)
      const { dataBytes } = encodeData(text, version)
      const codewords = buildCodewords(dataBytes, version)
      return buildMatrix(version, codewords)
    }

    function toCanvas(canvasEl, text, opts) {
      const mat = generate(text, opts)
      renderCanvas(canvasEl, mat, opts)
    }

    function toDataURL(text, opts) {
      return new Promise((resolve, reject) => {
        try {
          const canvas = document.createElement('canvas')
          const mat = generate(text, opts)
          renderCanvas(canvas, mat, opts)
          resolve(canvas.toDataURL('image/png'))
        } catch (err) {
          reject(err)
        }
      })
    }

    return { toCanvas, toDataURL }
  })()

  global.QRLocal = QRLocal
})(window)
