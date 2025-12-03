// 测试新的kg-api.cloud API集成
const { nanobanana, generateImage } = require('./src/lib/ai.ts');

async function testAPI() {
  console.log('开始测试新的Nano-banana API...');
  
  try {
    // 测试简单的图像生成
    console.log('\n1. 测试基础图像生成...');
    const result = await generateImage('一只可爱的猫咪', {
      model: 'nano-banana',
      aspectRatio: '1:1',
      responseFormat: 'url'
    });
    
    console.log('生成结果:', result);
    
    if (result.imageUrl) {
      console.log('✅ 基础API测试成功！');
      console.log('图像URL:', result.imageUrl);
    }
    
  } catch (error) {
    console.error('❌ API测试失败:', error.message);
  }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  testAPI().then(() => {
    console.log('测试完成');
  }).catch(error => {
    console.error('测试执行失败:', error);
  });
}

module.exports = { testAPI };