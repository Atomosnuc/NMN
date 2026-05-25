const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens

describe('NMN', () => {
  let accounts, deployer
  let mirian, castar, tharni, pony, penny, brass, copper
  let tokenAddresses = Array()

  const Coin = {

  }

  beforeEach(async () => {
    // Set up accounts
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    liquidityProvider = accounts[1]
    investor1 = accounts[2]
    investor2 = accounts[3]

    // Deploy Tokens
    const Token = await ethers.getContractFactory('Token')

    mirian = await Token.deploy('Mirian', 'MRN', '1000000')
    castar = await Token.deploy('Castar', 'CSTR', '1000000')
    tharni = await Token.deploy('Tharni', 'TRN', '1000000')
    pony = await Token.deploy('Silver Pony', 'PONY', '1000000')
    penny = await Token.deploy('Silver Penny', 'PENNY', '1000000')
    brass = await Token.deploy('Brass Coin', 'BRASS', '1000000')
    copper = await Token.deploy('Copper Coin', 'COP', '1000000')

    tokenAddresses = [
      mirian.address,
      castar.address,
      tharni.address,
      pony.address,
      penny.address,
      brass.address,
      copper.address
    ]

    // Send tokens to liquidity provider
    let transaction = await mirian.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()

    transaction = await castar.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    transaction = await tharni.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    transaction = await pony.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    transaction = await penny.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    transaction = await brass.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    transaction = await copper.connect(deployer).transfer(liquidityProvider.address, tokens(100000))
    await transaction.wait()
    
    // send mirian to investor 1
    transaction = await mirian.connect(deployer).transfer(investor1.address, tokens(100000))
    await transaction.wait()
    // send castar to investor 2
    transaction = await castar.connect(deployer).transfer(investor2.address, tokens(100000))
    await transaction.wait()

    // Deploy NMN
    const NMN = await ethers.getContractFactory('NMN')
    nmn = await NMN.deploy(tokenAddresses)

    // Initialize 1 pool
    transaction = await nmn.connect(deployer).initializePool(0, 1)
  })

  describe('Deployment', () => {
    let result
    it('has an address', async () => {
      expect(nmn.address).to.not.equal(0x0)
    })
    it('tracks address of all tokens', async () => {
      for (let i = 0; i < 7; i++) {
        expect(await nmn.tokens(1)).to.equal(tokenAddresses[1])
      }
    })

  })

  describe('Initialize Pool', () => {
    describe('Success', async () => {
      it('Emits PoolInitialized event', async () => {
        transaction = await nmn.connect(deployer).initializePool(0, 2)
        await expect(transaction).to.emit(nmn, 'PoolInitialized')
        .withArgs(mirian.address, tharni.address)
      })
    })

    describe('Failure', async () => {
      it('fails to initialize if already exists', async () => {
      await expect(nmn.connect(deployer).initializePool(0, 1)).to.be.reverted
      })

      it('does not let non owner to initialize', async () => {
      await expect(nmn.connect(liquidityProvider).initializePool(0, 2)).to.be.reverted
      })
    })
  })
  describe('Adding liquidity', () => {
    let amount, transaction, result
    beforeEach(async () => {
      // Deployer approves 100k from each token
      amount = tokens(100000)

      transaction = await mirian.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await castar.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await tharni.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await pony.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await penny.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await brass.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await copper.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
    })

    describe('Success', async () => {
      it('updates balances', async () => {
        // Deployer adds liquidity, 1000 mirian and 4000 castar
        amount = 1000
        transaction = await nmn.connect(deployer)
          .addLiquidity(
            0,
            tokens(amount),
            1,
            tokens(amount * 4)
          )
        await transaction.wait()

        // Check NMN receives tokens
        expect(await mirian.balanceOf(nmn.address)).to.equal(tokens(amount))
        expect(await castar.balanceOf(nmn.address)).to.equal(tokens(amount * 4))
        result = await nmn.getPoolState(0, 1)
        expect(result.reserve0).to.equal(tokens(amount))
        expect(result.reserve1).to.equal(tokens(amount * 4))
      })

      it('handles reverse order', async () => {
        // Deployer adds liquidity, 4000 castar and 1000 mirian
        amount = 1000
        transaction = await nmn.connect(deployer)
          .addLiquidity(
            1,
            tokens(amount * 4),
            0,
            tokens(amount)
          )
        await transaction.wait()

        // Check NMN receives tokens
        expect(await mirian.balanceOf(nmn.address)).to.equal(tokens(amount))
        expect(await castar.balanceOf(nmn.address)).to.equal(tokens(amount * 4))
        // also check balances in reverse order
        result = await nmn.getPoolState(1, 0)
        expect(result.reserve0).to.equal(tokens(amount))
        expect(result.reserve1).to.equal(tokens(amount * 4))
      })

      it('updates shares', async () => {
        amount = 1000
        transaction = await nmn.connect(deployer)
          .addLiquidity(
            0,
            tokens(amount),
            1,
            tokens(amount * 4)
          )
        await transaction.wait()
        //check deployer has 100 shares
        expect(await nmn.getUserShares(1, 0, deployer.address)).to.equal(tokens(100))
        // check pool has 100 shares
        result = await nmn.getPoolState(1, 0)
        expect(result.totalShares).to.equal(tokens(100))
      })

      it('calculates ratio', async () => {
        // Deployer adds liquidity, 1000 mirian and 4000 castar
        amount = 1000
        transaction = await nmn.connect(deployer)
          .addLiquidity(0, tokens(amount), 1, tokens(amount * 4))
        await transaction.wait()
        ///// LP adds more liquidity/////////////////
        // LP approves 500 miran and 2000 castar
        amount = 500
        let deposit0 = tokens(amount)
        transaction = await mirian.connect(liquidityProvider).approve(nmn.address, tokens(amount))
        await transaction.wait()
        transaction = await castar.connect(liquidityProvider).approve(nmn.address, tokens(amount * 4))
        await transaction.wait()
        // Calculates the amount of castar for 500 mirian
        let deposit1 = await nmn.calculateLiquidityAmount(0, 1, deposit0)

        // LP adds liquidity
        transaction = await nmn.connect(liquidityProvider)
          .addLiquidity(0, deposit0, 1, deposit1)
        await transaction.wait()

        // check pool has 100 shares
        result = await nmn.getPoolState(1, 0)
        expect(result.totalShares).to.equal(tokens(150))

        //Deployer should still have 100 shares
        expect(await nmn.getUserShares(1, 0, deployer.address)).to.equal(tokens(100))

        // Pool should have now 150 shares
        result = await nmn.getPoolState(1, 0)
        expect(result.totalShares).to.equal(tokens(150))
      })

      it('Emits LiquidityAdded event', async () => {
        // Deployer adds liquidity, 1000 mirian and 4000 castar
        amount = 1000
        transaction = await nmn.connect(deployer)
          .addLiquidity(0, tokens(amount), 1, tokens(amount * 4))
        await transaction.wait()

        timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        let check = await nmn.getPoolState(0, 1)
        await expect(transaction).to.emit(nmn, 'LiquidityAdded')
        .withArgs(
          deployer.address,
          mirian.address,
          castar.address,
          tokens(amount),
          tokens(amount * 4),
          tokens(100),
          check.reserve0,
          check.reserve1,
          check.totalShares,
          timestamp
        )
        
      })
    })

    describe('Failure', async () => {
      it('reverts "IdenticalTokens" when try to caclulate liquidity amount for same tokens', async () => {
        amount = tokens(1000)
        await expect(nmn.calculateLiquidityAmount(0,0, amount))
          .to.be.revertedWithCustomError(nmn, 'IdenticalTokens')
      })

      it('reverts with "ZeroAmount" when try to caclulate liquidity for zero amount', async () => {
        amount = tokens(0)
        await expect(nmn.calculateLiquidityAmount(0,1, amount))
          .to.be.revertedWithCustomError(nmn, 'ZeroAmount')
      })

      it('reverts with "PoolDoesNotExist" when pool does not exist', async () => {
        amount = tokens(1000)
        await expect(nmn.calculateLiquidityAmount(2,1, amount))
          .to.be.revertedWithCustomError(nmn, 'PoolDoesNotExist')
      })
      it('reverts with "ZeroLiquidity" when trying to calculate in empty pool', async () => {
        // there is no initial liquidity adde here
        amount = tokens(1000)
        await expect(nmn.calculateLiquidityAmount(0,1, amount))
          .to.be.revertedWithCustomError(nmn, 'ZeroLiquidity')
      })
    })
  })
  
  describe('Handling Swapping', () => {
    let amount0, amount1, transaction, result, estimate
    let pool, check
    beforeEach(async () => {
      // Deployer approves 100k from each token
      amount = tokens(100000)

      transaction = await mirian.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await castar.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await tharni.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await pony.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await penny.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await brass.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await copper.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()

      // Deployer adds liquidity, 1000 mirian and 4000 castar
      amount = 1000
      transaction = await nmn.connect(deployer)
        .addLiquidity(0, tokens(amount), 1, tokens(amount * 4))
      await transaction.wait()
      
      ///// LP adds more liquidity/////////////////
      // LP approves 500 miran and 2000 castar
      amount = 500
      let deposit0 = tokens(amount)
      transaction = await mirian.connect(liquidityProvider).approve(nmn.address, tokens(amount))
      await transaction.wait()
      transaction = await castar.connect(liquidityProvider).approve(nmn.address, tokens(amount * 4))
      await transaction.wait()
      // Calculates the amount of castar for 500 mirian
      let deposit1 = await nmn.calculateLiquidityAmount(0, 1, deposit0)
      // LP adds liquidity
      transaction = await nmn.connect(liquidityProvider)
        .addLiquidity(0, deposit0, 1, deposit1)
      await transaction.wait()


      //Investors aprove all tokens for convinience (usually only approve what is about to be transfered)
      amount = 100000
      transaction = await mirian.connect(investor1).approve(nmn.address, tokens(amount))
      await transaction.wait()
      transaction = await castar.connect(investor2).approve(nmn.address, tokens(amount))
      await transaction.wait()
    })

    describe('Success', async () => {
      it('emits Swap event', async () => {
      pool = await nmn.getPoolState(0, 1)
      // console.log(check.reserve0)
      // console.log(check.reserve1)
       // Check investor1 balance before swap
      balance = await castar.balanceOf(investor1.address)
      // console.log(`Investor1 castar balance before swap: ${ethers.utils.formatEther(balance)}\n`)

      // Estimate amount of castar ivestor1 will receive after swapping token1: include slippage
      estimate = await nmn.calculateAmountOut(0, 1, tokens(1))
      // console.log(`castar amount investor1 will receive after swap: ${ethers.utils.formatEther(estimate.amountOut)}\n`)

      // Investor1 swaps 1 token1
      transaction = await nmn.connect(investor1).swap(0, 1, tokens(1))
      result = await transaction.wait()
      

      check = await nmn.getPoolState(0, 1)
      
      let timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
      check = await nmn.getPoolState(0, 1)
      // console.log(timestamp)
      
      await expect(transaction).to.emit(nmn, 'Swap')
        .withArgs(
          investor1.address,
          mirian.address,
          castar.address,
          tokens(1),
          estimate.amountOut,
          estimate.feeAmount,
          check.reserve0,
          check.reserve1,
          timestamp
        )

      // // Check investor1 balance after swap
      balance = await castar.balanceOf(investor1.address)
      // console.log(`Investor1 castar balance after swap: ${ethers.utils.formatEther(balance)}\n`)
      expect(estimate.amountOut).to.equal(balance)

      // // Check AMM token balances are in sync
      expect(await mirian.balanceOf(nmn.address)).to.equal(check.reserve0)
      expect(await castar.balanceOf(nmn.address)).to.equal(check.reserve1)

      // // Check price after swapping
      // console.log(`Price: ${check.reserve0 / check.reserve1} \n`)
      })

      it('swaps reverse order', async () => {
      pool = await nmn.getPoolState(1, 0)
     
      // Check investor1 balance before swap
      balance = await mirian.balanceOf(investor2.address)
      // console.log(`investor2 mirian balance before swap: ${ethers.utils.formatEther(balance)}\n`)

      // Estimate amount of mirian ivestor2 will receive after swapping 4 castar, include slippage
      estimate = await nmn.calculateAmountOut(1, 0, tokens(4))
      // console.log(`mirian amount investor2 will receive after swap: ${ethers.utils.formatEther(estimate.amountOut)}\n`)
      // console.log(estimate)
      // // Investor2 swaps 4 castar
      transaction = await nmn.connect(investor2).swap(1, 0, tokens(4))
      result = await transaction.wait()
      
      check = await nmn.getPoolState(1, 0)
      let timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
      // // // console.log(timestamp)
      await expect(transaction).to.emit(nmn, 'Swap')
        .withArgs(
          investor2.address,
          castar.address,
          mirian.address,
          tokens(4),
          estimate.amountOut,
          estimate.feeAmount,
          check.reserve0,
          check.reserve1,
          timestamp
        )

      // Check investor2 balance after swap
      balance = await mirian.balanceOf(investor2.address)
      // console.log(`Investor1 castar balance after swap: ${ethers.utils.formatEther(balance)}\n`)
      expect(estimate.amountOut).to.equal(balance)

      // // // Check AMM token balances are in sync
      expect(await mirian.balanceOf(nmn.address)).to.equal(check.reserve0)
      expect(await castar.balanceOf(nmn.address)).to.equal(check.reserve1)

      // // Check price after swapping
      // console.log(`Price: ${check.reserve0 / check.reserve1} \n`)
      })

      it('handles multipple iterations', async () => {
        // Investor1 swaps 1 mirian for castar
        estimate = await nmn.calculateAmountOut(0, 1, tokens(1))
        transaction = await nmn.connect(investor1).swap(0, 1, tokens(1))
        result = await transaction.wait()
        
        let timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        check = await nmn.getPoolState(0, 1)
        
        await expect(transaction).to.emit(nmn, 'Swap')
          .withArgs(
            investor1.address,
            mirian.address,
            castar.address,
            tokens(1),
            estimate.amountOut,
            estimate.feeAmount,
            check.reserve0,
            check.reserve1,
            timestamp
        )

        // investor2 swaps 4 castar for mirian
        estimate = await nmn.calculateAmountOut(1, 0, tokens(4))
        transaction = await nmn.connect(investor2).swap(1, 0, tokens(4))
        result = await transaction.wait()
        
        check = await nmn.getPoolState(1, 0)
        timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        // // // console.log(timestamp)
        await expect(transaction).to.emit(nmn, 'Swap')
          .withArgs(
            investor2.address,
            castar.address,
            mirian.address,
            tokens(4),
            estimate.amountOut,
            estimate.feeAmount,
            check.reserve0,
            check.reserve1,
            timestamp
        )

        // Investor1 swaps 100 mirian for castar
        estimate = await nmn.calculateAmountOut(0, 1, tokens(100))
        transaction = await nmn.connect(investor1).swap(0, 1, tokens(100))
        result = await transaction.wait()
        
        timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        check = await nmn.getPoolState(0, 1)
        
        await expect(transaction).to.emit(nmn, 'Swap')
          .withArgs(
            investor1.address,
            mirian.address,
            castar.address,
            tokens(100),
            estimate.amountOut,
            estimate.feeAmount,
            check.reserve0,
            check.reserve1,
            timestamp
        )
        // console.log(estimate)
        // console.log(check)
      })
    })

    describe('Failure', async () => {
      it('Rerverts with ZeroAmount when try to swap zero amount', async () => {
        await expect(nmn.calculateAmountOut(0, 1, tokens(0)))
        .to.be.revertedWithCustomError(nmn, 'ZeroAmount')
      })

      it('Rerverts  when  pool doenst exist', async () => {
        await expect(nmn.calculateAmountOut(8, 1, tokens(1)))
        .to.be.reverted
      })
    })  
  })

  describe('Removing Liquidity', () => {
    let amount, transaction, result, estimate
    let pool, check
    beforeEach(async () => {
      // Deployer approves 100k from each token
      amount = tokens(100000)

      transaction = await mirian.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await castar.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await tharni.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await pony.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await penny.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await brass.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()
      transaction = await copper.connect(deployer).approve(nmn.address, amount)
      await transaction.wait()

      // Deployer adds liquidity, 1000 mirian and 4000 castar
      amount = 1000
      transaction = await nmn.connect(deployer)
        .addLiquidity(0, tokens(amount), 1, tokens(amount * 4))
      await transaction.wait()
      
      ///// LP adds more liquidity/////////////////
      // LP approves 500 miran and 2000 castar
      amount = 500
      let deposit0 = tokens(amount)
      transaction = await mirian.connect(liquidityProvider).approve(nmn.address, tokens(amount))
      await transaction.wait()
      transaction = await castar.connect(liquidityProvider).approve(nmn.address, tokens(amount * 4))
      await transaction.wait()
      // Calculates the amount of castar for 500 mirian
      let deposit1 = await nmn.calculateLiquidityAmount(0, 1, deposit0)
      // LP adds liquidity
      transaction = await nmn.connect(liquidityProvider)
        .addLiquidity(0, deposit0, 1, deposit1)
      await transaction.wait()
    })
    
    describe('Success', async () => {
      it('emits LiquidityRemoved event', async () => {
        amount = tokens(20)
        estimate = await nmn.calculateWithdrawAmount(0, 1, amount)

        transaction = await nmn.connect(liquidityProvider).removeLiquidity(0, 1, amount)
        result = await transaction.wait()

        timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        check = await nmn.getPoolState(0, 1)
        await expect(transaction).to.emit(nmn, 'LiquidityRemoved')
        .withArgs(
          liquidityProvider.address,
          mirian.address,
          castar.address,
          estimate.coin0Amount,
          estimate.coin1Amount,
          amount,
          check.reserve0,
          check.reserve1,
          check.totalShares,
          timestamp
        )
      })
    })

    describe('Failure', async () => {
      it('reverts when trying to remove more shares than owned', async () => {
        amount = tokens(60)
        estimate = await nmn.calculateWithdrawAmount(0, 1, amount)
        await expect(nmn.connect(liquidityProvider).removeLiquidity(0, 1, amount))
        .to.be.revertedWith("Cannot withdraw more shares than you own")
      })
    })
  })
})
