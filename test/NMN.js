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

  beforeEach(async () => {
    // Set up accounts
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    liquidityProvider = accounts[1]

    // Deploy Tokens
    const Token = await ethers.getContractFactory('Token')
    
    mirian = await Token.deploy('Mirian','MRN','1000000')
    castar = await Token.deploy('Castar','CSTR','1000000')
    tharni = await Token.deploy('Tharni','TRN','1000000')
    pony = await Token.deploy('Silver Pony','PONY','1000000')
    penny = await Token.deploy('Silver Penny','PENNY','1000000')
    brass = await Token.deploy('Brass Coin','BRASS','1000000')
    copper = await Token.deploy('Copper Coin','COP','1000000')

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

    // Deploy NMN
    const NMN = await ethers.getContractFactory('NMN')
    nmn = await NMN.deploy(tokenAddresses)
  })

  describe('Deployment', () => {
    let result
    it('has an address', async () => {
      expect(nmn.address).to.not.equal(0x0)
    })
    it('tracks address of all tokens', async () => {
      for(let i = 0 ; i < 7 ; i++){
        expect(await nmn.tokens(1)).to.equal(tokenAddresses[1])
      }
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

    it('updates balances', async () => {
      // Deployer adds liquidity, 1000 mirian and 4000 castar
      amount = 1000
      transaction = await nmn.connect(deployer)
      .addLiquidity(
        0,
        tokens(amount),
        1,
        tokens(amount*4)
      )
      await transaction.wait()

      // Check NMN receives tokens
      expect(await mirian.balanceOf(nmn.address)).to.equal(tokens(amount))
      expect(await castar.balanceOf(nmn.address)).to.equal(tokens(amount*4))
      result = await nmn.getPoolState(0,1)
      expect(result.reserve0).to.equal(tokens(amount))
      expect(result.reserve1).to.equal(tokens(amount*4))
    })

    it('handles reverse order', async () => {
      // Deployer adds liquidity, 4000 castar and 1000 mirian
      amount = 1000
      transaction = await nmn.connect(deployer)
      .addLiquidity(
        1,
        tokens(amount*4),
        0,
        tokens(amount)
      )
      await transaction.wait()

      // Check NMN receives tokens
      expect(await mirian.balanceOf(nmn.address)).to.equal(tokens(amount))
      expect(await castar.balanceOf(nmn.address)).to.equal(tokens(amount*4))
      // also check balances in reverse order
      result = await nmn.getPoolState(1,0)
      expect(result.reserve0).to.equal(tokens(amount))
      expect(result.reserve1).to.equal(tokens(amount*4))
    })

    it('updates shares', async () => {
      amount = 1000
      transaction = await nmn.connect(deployer)
      .addLiquidity(
        0,
        tokens(amount),
        1,
        tokens(amount*4)
      )
      await transaction.wait()
      //check deployer has 100 shares
      expect(await nmn.getUserShares(1,0, deployer.address)).to.equal(tokens(100))
      // check pool has 100 shares
      result = await nmn.getPoolState(1,0)
      expect(result.totalShares).to.equal(tokens(100))

      ///// LP adds more liquidity/////////////////
      // LP approves 

    })

    it('calculates ratio', async () => {
      // Deployer adds liquidity, 1000 mirian and 4000 castar
      amount = 1000
      transaction = await nmn.connect(deployer)
        .addLiquidity(0,tokens(amount), 1, tokens(amount*4))
      await transaction.wait()
      ///// LP adds more liquidity/////////////////
      // LP approves 500 miran and 2000 castar
      amount = 500
      let deposit0= tokens(amount)
      transaction = await mirian.connect(liquidityProvider).approve(nmn.address, tokens(amount))
      await transaction.wait()
      transaction = await castar.connect(liquidityProvider).approve(nmn.address, tokens(amount*4))
      await transaction.wait()
      // Calculates the amount of castar for 500 mirian
      let deposit1 = await nmn.calculateLiquidityAmount(0, 1, deposit0)

      // LP adds liquidity
      console.log("asdasd")
      transaction = await nmn.connect(liquidityProvider)
        .addLiquidity(0, deposit0, 1, deposit1)
      await transaction.wait()
      // check pool has 100 shares
      result = await nmn.getPoolState(1,0)
      expect(result.totalShares).to.equal(tokens(150))
      //Deployer should still have 100 shares
      expect(await nmn.getUserShares(1,0, deployer.address)).to.equal(tokens(100))
      // Pool should have now 150 shares
      result = await nmn.getPoolState(1,0)
      expect(result.totalShares).to.equal(tokens(150))
    })

  })

})
