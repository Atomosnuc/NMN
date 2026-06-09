const { main } = require("./seed")

if (!process.env.SEED_SWAPS_PER_POOL) {
  process.env.SEED_SWAPS_PER_POOL = "2"
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
